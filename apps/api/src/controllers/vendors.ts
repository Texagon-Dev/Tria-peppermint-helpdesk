import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { checkSession, requireAdmin } from "../lib/session";
import { prisma } from "../prisma";
import { parse } from "csv-parse";
import { pipeline } from "stream";
import util from "util";
import type { MultipartFile } from "@fastify/multipart";
import {
    ICreateVendorBody,
    IUpdateVendorBody,
    IBulkDeleteBody,
    IVendorIdParams,
    ICategoryParams,
    ICreateCategoryBody,
    ICategoryIdParams
} from "../lib/types/request";

const pump = util.promisify(pipeline);

export function vendorRoutes(fastify: FastifyInstance) {
    // Create vendor (admin only)
    fastify.post<{ Body: ICreateVendorBody }>(
        "/api/v1/vendor/create",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { name, email, categoryId, description } = request.body;

            // Validate required fields
            if (!name || !email || !categoryId || !description) {
                return reply.status(400).send({
                    success: false,
                    error: "Name, email, categoryId, and description are required",
                });
            }

            try {
                const vendor = await prisma.vendor.create({
                    data: {
                        name,
                        email,
                        categoryId,
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
            const { id, name, email, categoryId, description, active } = request.body;

            if (!id) {
                return reply.status(400).send({ success: false, error: "Vendor ID is required" });
            }

            try {
                const vendor = await prisma.vendor.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        categoryId,
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
                include: {
                    category: true,
                },
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
                include: {
                    category: true,
                },
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

    // Get vendors by category name (for AI agent)
    fastify.get<{ Params: ICategoryParams }>(
        "/api/v1/vendors/category/:category",
        async (request, reply) => {
            const { category } = request.params;

            const vendors = await prisma.vendor.findMany({
                where: {
                    category: {
                        name: category,
                    },
                    active: true,
                },
                include: {
                    category: true,
                },
                orderBy: { name: "asc" },
            });

            reply.send({ success: true, vendors });
        }
    );

    // Export vendors to CSV (admin only)
    fastify.get(
        "/api/v1/vendors/export",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const vendors = await prisma.vendor.findMany({
                include: {
                    category: true,
                },
                orderBy: { name: "asc" },
            });

            // Helper to escape CSV fields
            const escapeCSV = (field: string | null | undefined) => {
                if (!field) return "";
                const stringField = String(field);
                if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            };

            // Use streaming for memory efficiency with large datasets
            const { Readable } = require("stream");
            const readable = Readable.from((async function* () {
                yield "name,email,category,description\n";
                for (const v of vendors) {
                    yield `${escapeCSV(v.name)},${escapeCSV(v.email)},${escapeCSV(v.category?.name)},${escapeCSV(v.description)}\n`;
                }
            })());

            reply
                .header("Content-Type", "text/csv")
                .header("Content-Disposition", "attachment; filename=vendors.csv")
                .send(readable);
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

            // Pre-load categories for mapping
            const existingCategories = await prisma.vendorCategory.findMany();
            const categoryMap = new Map<string, string>(); // lowercase name -> id

            existingCategories.forEach(c => {
                categoryMap.set(c.name.toLowerCase().trim(), c.id);
            });

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

                            // Handle category mapping
                            let categoryId: string;
                            const normalizedCategoryName = category.trim();
                            const lowerCategoryName = normalizedCategoryName.toLowerCase();

                            if (categoryMap.has(lowerCategoryName)) {
                                categoryId = categoryMap.get(lowerCategoryName)!;
                            } else {
                                // Create new category
                                try {
                                    const newCategory = await prisma.vendorCategory.create({
                                        data: { name: normalizedCategoryName }
                                    });
                                    categoryId = newCategory.id;
                                    categoryMap.set(lowerCategoryName, categoryId); // Update map
                                } catch (err: any) {
                                    // Handle race condition if category created by another process/record
                                    if (err.code === 'P2002') {
                                        const existing = await prisma.vendorCategory.findUnique({
                                            where: { name: normalizedCategoryName }
                                        });
                                        if (existing) {
                                            categoryId = existing.id;
                                            categoryMap.set(lowerCategoryName, categoryId);
                                        } else {
                                            totalErrors++;
                                            if (errors.length < 50) errors.push({ email, error: `Failed to create/find category: ${normalizedCategoryName}` });
                                            continue;
                                        }
                                    } else {
                                        totalErrors++;
                                        if (errors.length < 50) errors.push({ email, error: `Category creation error: ${err.message}` });
                                        continue;
                                    }
                                }
                            }

                            batch.push({
                                name,
                                email,
                                categoryId, // Use the mapped UUID
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

    // === VENDOR CATEGORY ENDPOINTS ===

    // Get all categories (admin only)
    fastify.get(
        "/api/v1/vendor-categories",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const categories = await prisma.vendorCategory.findMany({
                orderBy: { name: "asc" },
            });

            reply.send({ success: true, categories });
        }
    );

    // Create vendor category (admin only)
    fastify.post<{ Body: ICreateCategoryBody }>(
        "/api/v1/vendor-category/create",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { name } = request.body;

            if (!name || name.trim() === "") {
                return reply.status(400).send({
                    success: false,
                    error: "Category name is required",
                });
            }

            try {
                const category = await prisma.vendorCategory.create({
                    data: {
                        name: name.trim(),
                    },
                });

                reply.send({ success: true, category });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A category with this name already exists",
                    });
                }
                throw error;
            }
        }
    );

    // Delete vendor category (admin only)
    fastify.delete<{ Params: ICategoryIdParams }>(
        "/api/v1/vendor-category/:id/delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.vendorCategory.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2003") { // Foreign key constraint failed
                    return reply.status(400).send({
                        success: false,
                        error: "Cannot delete category because it is in use by one or more vendors.",
                    });
                }
                if (error.code === "P2025") { // Record to delete does not exist
                    return reply.status(404).send({ success: false, error: "Category not found" });
                }
                throw error;
            }
        }
    );
}
