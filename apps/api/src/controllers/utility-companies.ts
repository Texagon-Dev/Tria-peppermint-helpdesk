import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { checkSession, requireAdmin } from "../lib/session";
import { prisma } from "../prisma";
import { parse } from "csv-parse";
import { pipeline } from "stream";
import util from "util";
import type { MultipartFile } from "@fastify/multipart";
import {
    ICreateUtilityCompanyBody,
    IUpdateUtilityCompanyBody,
    IBulkDeleteBody,
    IUtilityCompanyIdParams,
    IUtilityCategoryFilterParams,
    ICreateUtilityCategoryBody,
    IUtilityCategoryIdParams
} from "../lib/types/request";

const pump = util.promisify(pipeline);

export function utilityCompanyRoutes(fastify: FastifyInstance) {
    // Create utility company (admin only)
    fastify.post<{ Body: ICreateUtilityCompanyBody }>(
        "/api/v1/utility-company/create",
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
                const company = await prisma.utilityCompany.create({
                    data: {
                        name,
                        email,
                        categoryId,
                        description,
                    },
                });

                reply.send({ success: true, company });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A utility company with this email already exists",
                    });
                }
                throw error;
            }
        }
    );

    // Update utility company (admin only)
    fastify.post<{ Body: IUpdateUtilityCompanyBody }>(
        "/api/v1/utility-company/update",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id, name, email, categoryId, description, active } = request.body;

            if (!id) {
                return reply.status(400).send({ success: false, error: "Utility company ID is required" });
            }

            try {
                const company = await prisma.utilityCompany.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        categoryId,
                        description,
                        active,
                    },
                });

                reply.send({ success: true, company });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A utility company with this email already exists",
                    });
                }
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Utility company not found" });
                }
                throw error;
            }
        }
    );

    // Get all utility companies (admin only)
    fastify.get(
        "/api/v1/utility-companies/all",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const companies = await prisma.utilityCompany.findMany({
                include: {
                    category: true,
                },
                orderBy: { createdAt: "desc" },
            });

            reply.send({ success: true, companies });
        }
    );

    // Get single utility company (admin only)
    fastify.get<{ Params: IUtilityCompanyIdParams }>(
        "/api/v1/utility-company/:id",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            const company = await prisma.utilityCompany.findUnique({
                where: { id },
                include: {
                    category: true,
                },
            });

            if (!company) {
                return reply.status(404).send({ success: false, error: "Utility company not found" });
            }

            reply.send({ success: true, company });
        }
    );

    // Get utility company by email (for AI agent / routing)
    fastify.get<{ Params: { email: string } }>(
        "/api/v1/utility-company/email/:email",
        async (request, reply) => {
            const { email } = request.params;

            const company = await prisma.utilityCompany.findUnique({
                where: { email },
                include: {
                    category: true,
                },
            });

            if (!company) {
                return reply.status(404).send({ success: false, error: "Utility company not found" });
            }

            reply.send({ success: true, company });
        }
    );

    // Delete utility company (admin only)
    fastify.delete<{ Params: IUtilityCompanyIdParams }>(
        "/api/v1/utility-companies/:id/delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.utilityCompany.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Utility company not found" });
                }
                throw error;
            }
        }
    );

    // Bulk delete utility companies (admin only)
    fastify.post<{ Body: IBulkDeleteBody }>(
        "/api/v1/utility-companies/bulk-delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { ids } = request.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return reply.status(400).send({ success: false, error: "IDs array is required and cannot be empty" });
            }

            try {
                const result = await prisma.utilityCompany.deleteMany({
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

    // Get utility companies by category name (for AI agent)
    fastify.get<{ Params: IUtilityCategoryFilterParams }>(
        "/api/v1/utility-companies/category/:category",
        async (request, reply) => {
            const { category } = request.params;

            const companies = await prisma.utilityCompany.findMany({
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

            reply.send({ success: true, companies });
        }
    );

    // Export utility companies to CSV (admin only)
    fastify.get(
        "/api/v1/utility-companies/export",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const companies = await prisma.utilityCompany.findMany({
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

            // Build CSV content
            const csvHeader = "name,email,category,description\n";
            const csvRows = companies.map(c =>
                `${escapeCSV(c.name)},${escapeCSV(c.email)},${escapeCSV(c.category?.name)},${escapeCSV(c.description)}`
            ).join("\n");

            reply
                .header("Content-Type", "text/csv; charset=utf-8")
                .header("Content-Disposition", "attachment; filename=utility-companies.csv")
                .send(csvHeader + csvRows);
        }
    );

    // Upload utility companies from CSV (admin only)
    fastify.post(
        "/api/v1/utility-companies/upload",
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
            const existingCategories = await prisma.utilityCategory.findMany();
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

                            // Handle category mapping (by name, auto-create if not found)
                            let categoryId: string;
                            const normalizedCategoryName = category.trim();
                            const lowerCategoryName = normalizedCategoryName.toLowerCase();

                            if (categoryMap.has(lowerCategoryName)) {
                                categoryId = categoryMap.get(lowerCategoryName)!;
                            } else {
                                // Create new category
                                try {
                                    const newCategory = await prisma.utilityCategory.create({
                                        data: { name: normalizedCategoryName }
                                    });
                                    categoryId = newCategory.id;
                                    categoryMap.set(lowerCategoryName, categoryId); // Update map
                                } catch (err: any) {
                                    // Handle race condition if category created by another process/record
                                    if (err.code === 'P2002') {
                                        const existing = await prisma.utilityCategory.findUnique({
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
                                        if (errors.length < 50) errors.push({ email, error: `An unexpected error occurred while creating category '${normalizedCategoryName}'.` });
                                        console.error(`Category creation error for ${email}:`, err.message);
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
                await prisma.utilityCompany.createMany({
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

    // === UTILITY CATEGORY ENDPOINTS ===

    // Get all utility categories (admin only)
    fastify.get(
        "/api/v1/utility-categories",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const categories = await prisma.utilityCategory.findMany({
                orderBy: { name: "asc" },
            });

            reply.send({ success: true, categories });
        }
    );

    // Create utility category (admin only)
    fastify.post<{ Body: ICreateUtilityCategoryBody }>(
        "/api/v1/utility-category/create",
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
                const category = await prisma.utilityCategory.create({
                    data: {
                        name: name.trim(),
                    },
                });

                reply.send({ success: true, category });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A utility category with this name already exists",
                    });
                }
                throw error;
            }
        }
    );

    // Delete utility category (admin only)
    fastify.delete<{ Params: IUtilityCategoryIdParams }>(
        "/api/v1/utility-category/:id/delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.utilityCategory.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2003") { // Foreign key constraint failed
                    return reply.status(400).send({
                        success: false,
                        error: "Cannot delete category because it is in use by one or more utility companies.",
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
