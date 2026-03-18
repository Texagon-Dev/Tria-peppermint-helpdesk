import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../lib/session";
import { validateApiKey } from "../lib/api-key";
import { checkToken } from "../lib/jwt";
import { prisma } from "../prisma";
import { startBackgroundJob } from "../lib/domus/worker";

// =============================================================================
// AUTH HELPER — accepts either admin JWT or API key
// =============================================================================

async function requireAdminOrApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try API key first (cheaper check)
  const apiKeyResult = await validateApiKey(request);
  if (apiKeyResult) return;

  // Fall back to admin JWT
  return requireAdmin(request, reply);
}

// =============================================================================
// ROUTES
// =============================================================================

export function domusRoutes(fastify: FastifyInstance) {
  // ─── UPLOAD & JOB MONITORING ─────────────────────────────────────────────

  // POST /api/v1/domus/upload — Upload CSV and start background import
  fastify.post(
    "/api/v1/domus/upload",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await (request as any).file();

      if (!data) {
        return reply
          .status(400)
          .send({ success: false, error: "No file uploaded" });
      }

      if (
        data.mimetype !== "text/csv" &&
        !data.filename?.endsWith(".csv")
      ) {
        return reply
          .status(400)
          .send({ success: false, error: "Only CSV files are accepted" });
      }

      // Save to temp directory
      const uploadDir = path.join(os.tmpdir(), "domus_uploads");
      fs.mkdirSync(uploadDir, { recursive: true });

      const tempFileName = `${Date.now()}_${data.filename}`;
      const tempFilePath = path.join(uploadDir, tempFileName);

      // Write file stream to disk
      const writeStream = fs.createWriteStream(tempFilePath);
      await pipeline(data.file, writeStream);

      const fileStat = fs.statSync(tempFilePath);

      // Create DomusJob record
      const job = await prisma.domusJob.create({
        data: {
          status: "QUEUED",
          filename: data.filename || "unknown.csv",
          fileSizeBytes: fileStat.size,
          uploadedById: (request as any).user?.id || null,
        },
      });

      // Fire-and-forget background processing
      startBackgroundJob(job.id, tempFilePath);

      return reply.status(202).send({
        success: true,
        jobId: job.id,
        status: "QUEUED",
        message: "Processing started",
      });
    }
  );

  // GET /api/v1/domus/jobs/:jobId — Get job status
  fastify.get(
    "/api/v1/domus/jobs/:jobId",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { jobId } = request.params as { jobId: string };

      const job = await prisma.domusJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return reply
          .status(404)
          .send({ success: false, error: "Job not found" });
      }

      reply.send({ success: true, job });
    }
  );

  // GET /api/v1/domus/jobs/:jobId/stream — SSE stream for job progress
  // Auth is skipped in global preHandler (EventSource can't send headers).
  // Token is validated here via query param instead.
  fastify.get(
    "/api/v1/domus/jobs/:jobId/stream",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Validate token from query param (EventSource cannot send Authorization header)
      const { token } = request.query as { token?: string };
      try {
        if (!token) throw new Error("No token");
        checkToken(token);
      } catch {
        return reply.status(401).send({ success: false, error: "Unauthorized" });
      }

      const { jobId } = request.params as { jobId: string };

      const job = await prisma.domusJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return reply
          .status(404)
          .send({ success: false, error: "Job not found" });
      }

      // SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:3000",
      });

      let lastStatus = "";
      let lastProcessedRows = -1;
      let keepaliveCounter = 0;

      const intervalId = setInterval(async () => {
        try {
          const currentJob = await prisma.domusJob.findUnique({
            where: { id: jobId },
          });

          if (!currentJob) {
            reply.raw.write(
              `event: error\ndata: ${JSON.stringify({ error: "Job not found" })}\n\n`
            );
            clearInterval(intervalId);
            reply.raw.end();
            return;
          }

          // Send update if status or progress changed
          if (
            currentJob.status !== lastStatus ||
            currentJob.processedRows !== lastProcessedRows
          ) {
            lastStatus = currentJob.status;
            lastProcessedRows = currentJob.processedRows;
            keepaliveCounter = 0;

            reply.raw.write(
              `event: status\ndata: ${JSON.stringify({
                status: currentJob.status,
                totalRows: currentJob.totalRows,
                processedRows: currentJob.processedRows,
                skippedRows: currentJob.skippedRows,
                errorMessage: currentJob.errorMessage,
                filename: currentJob.filename,
              })}\n\n`
            );

            // Close stream on terminal states
            if (
              currentJob.status === "COMPLETED" ||
              currentJob.status === "FAILED"
            ) {
              clearInterval(intervalId);
              reply.raw.end();
              return;
            }
          } else {
            keepaliveCounter++;
            // Send keepalive every 30 polls (30 seconds at 1s interval)
            if (keepaliveCounter >= 30) {
              keepaliveCounter = 0;
              reply.raw.write(`event: keepalive\ndata: {}\n\n`);
            }
          }
        } catch (err) {
          console.error(`SSE stream for job ${jobId} failed:`, err);
          clearInterval(intervalId);
          reply.raw.end();
        }
      }, 1000);

      // Clean up on client disconnect
      request.raw.on("close", () => {
        clearInterval(intervalId);
      });
    }
  );

  // ─── UNIT DATA (ADMIN) ──────────────────────────────────────────────────

  // GET /api/v1/domus/units — List units with search and pagination
  fastify.get(
    "/api/v1/domus/units",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { search, page = "1", limit = "25" } = request.query as {
        search?: string;
        page?: string;
        limit?: string;
      };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
      const skip = (pageNum - 1) * limitNum;

      const where = search
        ? {
            OR: [
              { searchTerm: { contains: search, mode: "insensitive" as const } },
              { name1: { contains: search, mode: "insensitive" as const } },
              { propertyNumber: { contains: search, mode: "insensitive" as const } },
              { unitNumber: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [units, total] = await Promise.all([
        prisma.domusUnit.findMany({
          where,
          orderBy: { propertyNumber: "asc" },
          skip,
          take: limitNum,
        }),
        prisma.domusUnit.count({ where }),
      ]);

      reply.send({ success: true, units, total, page: pageNum, limit: limitNum });
    }
  );

  // GET /api/v1/domus/units/:id — Get unit details with relations
  fastify.get(
    "/api/v1/domus/units/:id",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const unit = await prisma.domusUnit.findUnique({
        where: { id },
        include: {
          bankingInfo: true,
          allocationKeys: { orderBy: { keyIndex: "asc" } },
          scheduledCharges: { orderBy: { chargeIndex: "asc" } },
        },
      });

      if (!unit) {
        return reply
          .status(404)
          .send({ success: false, error: "Unit not found" });
      }

      reply.send({ success: true, unit });
    }
  );

  // GET /api/v1/domus/config — Get last upload metadata
  fastify.get(
    "/api/v1/domus/config",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [config, totalUnits] = await Promise.all([
        prisma.domusConfig.findFirst(),
        prisma.domusUnit.count(),
      ]);

      reply.send({ success: true, config, totalUnits });
    }
  );

  // ─── SEARCH ENDPOINTS (MCP + ADMIN) ─────────────────────────────────────

  // GET /api/v1/domus/search/email
  fastify.get(
    "/api/v1/domus/search/email",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = request.query as { email?: string };

      if (!email) {
        return reply
          .status(400)
          .send({ success: false, error: "email parameter required" });
      }

      const units = await prisma.domusUnit.findMany({
        where: {
          OR: [{ email }, { email2: email }],
        },
        include: { bankingInfo: true },
      });

      reply.send({ success: true, units });
    }
  );

  // GET /api/v1/domus/search/name
  fastify.get(
    "/api/v1/domus/search/name",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.query as { name?: string };

      if (!name) {
        return reply
          .status(400)
          .send({ success: false, error: "name parameter required" });
      }

      const units = await prisma.domusUnit.findMany({
        where: {
          OR: [
            { name1: { contains: name, mode: "insensitive" } },
            { name2: { contains: name, mode: "insensitive" } },
            { searchTerm: { contains: name, mode: "insensitive" } },
          ],
        },
        include: { bankingInfo: true },
      });

      reply.send({ success: true, units });
    }
  );

  // GET /api/v1/domus/search/property-unit
  fastify.get(
    "/api/v1/domus/search/property-unit",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { property_number, unit_number } = request.query as {
        property_number?: string;
        unit_number?: string;
      };

      if (!property_number && !unit_number) {
        return reply.status(400).send({
          success: false,
          error: "At least one of property_number or unit_number required",
        });
      }

      const where: any = {};
      if (property_number) where.propertyNumber = property_number;
      if (unit_number) where.unitNumber = unit_number;

      const units = await prisma.domusUnit.findMany({
        where,
        include: { bankingInfo: true },
      });

      reply.send({ success: true, units });
    }
  );

  // GET /api/v1/domus/search/tenant-number
  fastify.get(
    "/api/v1/domus/search/tenant-number",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenant_number } = request.query as { tenant_number?: string };

      if (!tenant_number) {
        return reply
          .status(400)
          .send({ success: false, error: "tenant_number parameter required" });
      }

      const units = await prisma.domusUnit.findMany({
        where: { tenantOwnerNumber: tenant_number },
        include: { bankingInfo: true },
      });

      reply.send({ success: true, units });
    }
  );

  // GET /api/v1/domus/unit/:propertyNumber/:unitNumber — Full unit detail by property+unit
  fastify.get(
    "/api/v1/domus/unit/:propertyNumber/:unitNumber",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { propertyNumber, unitNumber } = request.params as {
        propertyNumber: string;
        unitNumber: string;
      };

      const unit = await prisma.domusUnit.findFirst({
        where: { propertyNumber, unitNumber },
        include: {
          bankingInfo: true,
          allocationKeys: { orderBy: { keyIndex: "asc" } },
          scheduledCharges: { orderBy: { chargeIndex: "asc" } },
        },
      });

      if (!unit) {
        return reply
          .status(404)
          .send({ success: false, error: "Unit not found" });
      }

      reply.send({ success: true, unit });
    }
  );

  // ─── CLEAR ───────────────────────────────────────────────────────────────

  // DELETE /api/v1/domus/clear — Clear all DOMUS data
  fastify.delete(
    "/api/v1/domus/clear",
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await prisma.$transaction([
        prisma.domusScheduledCharge.deleteMany(),
        prisma.domusAllocationKey.deleteMany(),
        prisma.domusBankingInfo.deleteMany(),
        prisma.domusUnit.deleteMany(),
        prisma.domusJob.deleteMany(),
      ]);

      // Reset DomusConfig
      const config = await prisma.domusConfig.findFirst();
      if (config) {
        await prisma.domusConfig.update({
          where: { id: config.id },
          data: {
            lastUploadedFilename: null,
            lastFileUploadedAt: null,
          },
        });
      }

      reply.send({ success: true, message: "All DOMUS data cleared" });
    }
  );
}
