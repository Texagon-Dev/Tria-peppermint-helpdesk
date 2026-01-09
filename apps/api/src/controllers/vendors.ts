import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { checkSession, requireAdmin } from "../lib/session";
import { prisma } from "../prisma";
import { parse } from "csv-parse";
import { pipeline } from "stream";
import util from "util";
import type { MultipartFile } from "@fastify/multipart";

const pump = util.promisify(pipeline);

// Request type interfaces
interface ICreateVendorBody {
    name: string;
    email: string;
    category: string;
    description: string;
}

interface IUpdateVendorBody {
    id: string;
    name?: string;
    email?: string;
    category?: string;
    description?: string;
    active?: boolean;
}

interface IBulkDeleteBody {
    ids: string[];
}

interface IVendorIdParams {
    id: string;
}

interface ICategoryParams {
    category: string;
}

export function vendorRoutes(fastify: FastifyInstance) {
    // Create vendor (admin only)
    fastify.post<{ Body: ICreateVendorBody }>(
        "/api/v1/vendor/create",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { name, email, category, description } = request.body;

            // Validate required fields
            if (!name || !email || !category || !description) {
                return reply.status(400).send({
                    success: false,
                    error: "Name, email, category, and description are required",
                });
            }

            try {
                const vendor = await prisma.vendor.create({
                    data: {
                        name,
                        email,
                        category,
                        description,
                    },
                });

                reply.send({ success: true, vendor });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A vendor with this email already exists",
                    });
                }
                throw error;
            }
        }
    );

    // Update vendor (admin only)
    fastify.post<{ Body: IUpdateVendorBody }>(
        "/api/v1/vendor/update",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id, name, email, category, description, active } = request.body;

            if (!id) {
                return reply.status(400).send({ success: false, error: "Vendor ID is required" });
            }

            try {
                const vendor = await prisma.vendor.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        category,
                        description,
                        active,
                    },
                });

                reply.send({ success: true, vendor });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A vendor with this email already exists",
                    });
                }
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Vendor not found" });
                }
                throw error;
            }
        }
    );

    // Get all vendors (admin only)
    fastify.get(
        "/api/v1/vendors/all",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const vendors = await prisma.vendor.findMany({
                orderBy: { createdAt: "desc" },
            });

            reply.send({ success: true, vendors });
        }
    );

    // Get single vendor (admin only)
    fastify.get<{ Params: IVendorIdParams }>(
        "/api/v1/vendor/:id",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            const vendor = await prisma.vendor.findUnique({
                where: { id },
            });

            if (!vendor) {
                return reply.status(404).send({ success: false, error: "Vendor not found" });
            }

            reply.send({ success: true, vendor });
        }
    );

    // Delete vendor (admin only)
    fastify.delete<{ Params: IVendorIdParams }>(
        "/api/v1/vendors/:id/delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.vendor.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Vendor not found" });
                }
                throw error;
            }
        }
    );

    // Bulk delete vendors (admin only)
    fastify.post<{ Body: IBulkDeleteBody }>(
        "/api/v1/vendors/bulk-delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { ids } = request.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return reply.status(400).send({ success: false, error: "IDs array is required and cannot be empty" });
            }

            try {
                const result = await prisma.vendor.deleteMany({
                    where: {
                        id: {
                            in: ids
                        }
                    },
                });

                reply.send({ success: true, count: result.count });
            } catch (error: any) {
                throw error;
            }
        }
    );

    // Get vendors by category (for AI agent)
    fastify.get<{ Params: ICategoryParams }>(
        "/api/v1/vendors/category/:category",
        async (request, reply) => {
            const { category } = request.params;

            const vendors = await prisma.vendor.findMany({
                where: {
                    category,
                    active: true,
                },
                orderBy: { name: "asc" },
            });

            reply.send({ success: true, vendors });
        }
    );

    // Upload vendors from CSV (admin only)
    fastify.post(
        "/api/v1/vendors/upload",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const parts = (request as any).parts();
            let totalProcessed = 0;
            let totalCreated = 0;
            let totalErrors = 0;
            // Limit errors to avoid huge response payload
            const errors: any[] = [];

            for await (const part of parts) {
                if (part.file) {
                    if (part.mimetype !== 'text/csv' && !part.filename.endsWith('.csv')) {
                        // consume part to avoid hanging
                        part.file.resume();
                        continue;
                    }

                    const parser = parse({
                        columns: true,
                        skip_empty_lines: true,
                        trim: true,
                        relax_quotes: true
                    });

                    // We need to process in batches to avoid memory issues and too many transactions
                    let batch: any[] = [];
                    const BATCH_SIZE = 50;

                    try {
                        // Manually pumping the stream to control async flow
                        for await (const record of part.file.pipe(parser)) {
                            totalProcessed++;

                            const { name, email, category, description } = record;

                            if (!name || !email || !category || !description) {
                                totalErrors++;
                                if (errors.length < 50) errors.push({ email, error: "Missing required fields" });
                                continue;
                            }

                            batch.push({
                                name,
                                email,
                                category,
                                description,
                                active: true,
                            });

                            if (batch.length >= BATCH_SIZE) {
                                await processBatch(batch);
                                totalCreated += batch.length; // Approximate, if createMany succeeds
                                batch = [];
                            }
                        }

                        // Process remaining
                        if (batch.length > 0) {
                            await processBatch(batch);
                            totalCreated += batch.length;
                        }

                    } catch (err: any) {
                        return reply.status(400).send({ success: false, error: `CSV Parsing error: ${err.message}` });
                    }
                }
            }

            async function processBatch(records: any[]) {
                // createMany is faster but doesn't tell us which failed if one fails (postgres skips entire batch on constraint error usually unless ignoreDuplicates is set)
                // Use createMany with skipDuplicates: true if we want to ignore existing
                // Warning: skipDuplicates only works if there is a unique constraint conflict.
                await prisma.vendor.createMany({
                    data: records,
                    skipDuplicates: true
                });
            }

            reply.send({
                success: true,
                message: `Processed ${totalProcessed} records. Created/Ignored Duplicates: ${totalCreated}. Errors: ${totalErrors}`,
                errors: errors.length > 0 ? errors : undefined
            });
        }
    );
}
