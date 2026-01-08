import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { checkSession } from "../lib/session";
import { prisma } from "../prisma";
import multer from "fastify-multer";
import { parse } from "csv-parse/sync";

export function vendorRoutes(fastify: FastifyInstance) {
    // Create vendor (admin only)
    fastify.post(
        "/api/v1/vendor/create",
        {
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { name, email, category, description }: any = request.body;

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
    fastify.post(
        "/api/v1/vendor/update",
        {
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { id, name, email, category, description, active }: any = request.body;

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
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const vendors = await prisma.vendor.findMany({
                orderBy: { createdAt: "desc" },
            });

            reply.send({ success: true, vendors });
        }
    );

    // Get single vendor (admin only)
    fastify.get(
        "/api/v1/vendor/:id",
        {
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { id }: any = request.params;

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
    fastify.delete(
        "/api/v1/vendors/:id/delete",
        {
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { id }: any = request.params;

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
    fastify.delete(
        "/api/v1/vendors/bulk-delete",
        {
            preHandler: async (request, reply) => {
                const user = await checkSession(request);
                if (!user?.isAdmin) {
                    return reply.status(403).send({ success: false, error: "Admin access required" });
                }
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { ids }: any = request.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return reply.status(400).send({ success: false, error: "IDs array is required and cannot be empty" });
            }

            try {
                await prisma.vendor.deleteMany({
                    where: {
                        id: {
                            in: ids
                        }
                    },
                });

                reply.send({ success: true });
            } catch (error: any) {
                throw error;
            }
        }
    );

    // Get vendors by category (for AI agent)
    fastify.get(
        "/api/v1/vendors/category/:category",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { category }: any = request.params;

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
    const upload = multer({ storage: multer.memoryStorage() });

    fastify.post(
        "/api/v1/vendors/upload",
        {
            preHandler: [
                async (request, reply) => {
                    const user = await checkSession(request);
                    if (!user?.isAdmin) {
                        return reply.status(403).send({ success: false, error: "Admin access required" });
                    }
                },
                upload.single("file") as any
            ]
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const file = (request as any).file;
            if (!file) {
                return reply.status(400).send({ success: false, error: "No file uploaded" });
            }

            try {
                const fileContent = file.buffer.toString("utf-8");
                const records = parse(fileContent, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true
                }) as Record<string, string>[];

                if (records.length === 0) {
                    return reply.status(400).send({ success: false, error: "CSV file is empty" });
                }

                // Basic validation of header structure based on first record
                const requiredColumns = ["name", "email", "category", "description"];
                const firstRecord = records[0];
                const missingColumns = requiredColumns.filter(col => !(col in firstRecord));

                if (missingColumns.length > 0) {
                    return reply.status(400).send({
                        success: false,
                        error: `Missing required columns: ${missingColumns.join(", ")}`
                    });
                }

                let createdCount = 0;
                let errorCount = 0;
                const errors: any[] = [];

                for (const record of records) {
                    try {
                        const { name, email, category, description } = record;

                        // Validate required fields for this record
                        if (!name || !email || !category || !description) {
                            errorCount++;
                            errors.push({ email, error: "Missing required fields" });
                            continue;
                        }

                        // Upsert or Create - using create to catch duplicates simpler for now, 
                        // or upsert to update existing? User just said "upload into the db".
                        // Existing create logic throws if email exists. Let's try to create, and if it fails, log it.
                        await prisma.vendor.create({
                            data: {
                                name,
                                email,
                                category,
                                description,
                                active: true
                            }
                        });
                        createdCount++;
                    } catch (err: any) {
                        errorCount++;
                        if (err.code === 'P2002') {
                            errors.push({ email: record.email, error: "Vendor with this email already exists" });
                        } else {
                            errors.push({ email: record.email, error: err.message });
                        }
                    }
                }

                reply.send({
                    success: true,
                    message: `Processed ${records.length} vendors. Created: ${createdCount}, Failed: ${errorCount}`,
                    errors: errorCount > 0 ? errors : undefined
                });

            } catch (err: any) {
                return reply.status(400).send({ success: false, error: `Failed to parse CSV: ${err.message}` });
            }
        }
    );
}
