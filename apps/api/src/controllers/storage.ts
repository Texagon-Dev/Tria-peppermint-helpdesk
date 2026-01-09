import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "@fastify/multipart"; // Ensure declaration merging happens
import { prisma } from "../prisma";
import fs from "fs";
import util from "util";
import { pipeline } from "stream";
import path from "path";
import { randomUUID } from "crypto";
import { checkSession } from "../lib/session";

const pump = util.promisify(pipeline);

export function objectStoreRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/v1/storage/ticket/:id/upload/single",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await checkSession(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: "Unauthorized" });
      }

      const parts = (request as any).parts();

      let uploadPath = "";
      let originalName = "";
      let mimeType = "";
      let size = 0;
      let encoding = "";
      const userId = user.id;

      // Ensure uploads directory exists
      const uploadDir = "uploads/";
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      for await (const part of parts) {
        if (part.file) {
          // It's a file
          originalName = part.filename;
          mimeType = part.mimetype;
          encoding = part.encoding;

          // Sanitize filename
          const safeOriginal = path.basename(part.filename).replace(/[/\\]/g, "_");
          const filename = `${randomUUID()}-${safeOriginal}`;
          uploadPath = path.join(uploadDir, filename);

          await pump(part.file, fs.createWriteStream(uploadPath));

          // Get file stats for size
          const stats = fs.statSync(uploadPath);
          size = stats.size;
        }
      }

      if (!uploadPath) {
        return reply.status(400).send({ success: false, error: "No file uploaded" });
      }

      const uploadedFile = await prisma.ticketFile.create({
        data: {
          ticketId: request.params.id,
          filename: originalName,
          path: uploadPath,
          mime: mimeType,
          size: size,
          encoding: encoding,
          userId: userId,
        },
      });

      console.log(uploadedFile);

      reply.send({
        success: true,
      });
    }
  );

  // Get all ticket attachments

  // Delete an attachment

  // Download an attachment
}

