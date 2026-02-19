import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { checkSession, requireAdmin } from "../lib/session";
import { prisma } from "../prisma";
import { parse } from "csv-parse";
import { pipeline } from "stream";
import util from "util";
import type { MultipartFile } from "@fastify/multipart";
import {
    ICreateGLAccountBody,
    IUpdateGLAccountBody,
    IBulkDeleteBody,
    IGLAccountIdParams,
    IGLAccountCodeParams,
    IGLAccountClassParams
} from "../lib/types/request";

const pump = util.promisify(pipeline);

export function glAccountRoutes(fastify: FastifyInstance) {
    // Create GL account (admin only)
    fastify.post<{ Body: ICreateGLAccountBody }>(
        "/api/v1/gl-account/create",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { code, name, accountClass, accountClassName, taxCode, taxRate } = request.body;

            // Validate required fields
            if (!code || !name || !accountClass || !accountClassName || !taxCode || taxRate === undefined) {
                return reply.status(400).send({
                    success: false,
                    error: "All fields are required: code, name, accountClass, accountClassName, taxCode, taxRate",
                });
            }

            try {
                const account = await prisma.gLAccount.create({
                    data: {
                        code,
                        name,
                        accountClass,
                        accountClassName,
                        taxCode,
                        taxRate: taxRate,
                    },
                });

                reply.send({ success: true, account });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A GL account with this code already exists",
                    });
                }
                throw error;
            }
        }
    );

    // Update GL account (admin only)
    fastify.post<{ Body: IUpdateGLAccountBody }>(
        "/api/v1/gl-account/update",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id, code, name, accountClass, accountClassName, taxCode, taxRate, active } = request.body;

            if (!id) {
                return reply.status(400).send({ success: false, error: "GL account ID is required" });
            }

            try {
                const account = await prisma.gLAccount.update({
                    where: { id },
                    data: {
                        code,
                        name,
                        accountClass,
                        accountClassName,
                        taxCode,
                        taxRate: taxRate,
                        active,
                    },
                });

                reply.send({ success: true, account });
            } catch (error: any) {
                if (error.code === "P2002") {
                    return reply.status(400).send({
                        success: false,
                        error: "A GL account with this code already exists",
                    });
                }
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "GL account not found" });
                }
                throw error;
            }
        }
    );

    // Get all GL accounts (admin only)
    fastify.get(
        "/api/v1/gl-accounts/all",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const accounts = await prisma.gLAccount.findMany({
                orderBy: { code: "asc" },
            });

            reply.send({ success: true, accounts });
        }
    );

    // Get single GL account by ID (admin only)
    fastify.get<{ Params: IGLAccountIdParams }>(
        "/api/v1/gl-account/:id",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            const account = await prisma.gLAccount.findUnique({
                where: { id },
            });

            if (!account) {
                return reply.status(404).send({ success: false, error: "GL account not found" });
            }

            reply.send({ success: true, account });
        }
    );

    // Helper for secure session endpoint
    const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
        const user = await checkSession(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: "Authentication required" });
        }
    };

    // Get GL account by code (for AI agent / lookup)
    fastify.get<{ Params: IGLAccountCodeParams }>(
        "/api/v1/gl-account/code/:code",
        {
            preHandler: requireSession,
        },
        async (request, reply) => {
            const { code } = request.params;

            const account = await prisma.gLAccount.findUnique({
                where: { code },
            });

            if (!account) {
                return reply.status(404).send({ success: false, error: "GL account not found" });
            }

            reply.send({ success: true, account });
        }
    );

    // Get all distinct GL account classes (for AI agent / UI)
    fastify.get(
        "/api/v1/gl-accounts/classes",
        {
            preHandler: requireSession,
        },
        async (request, reply) => {
            const classes = await prisma.gLAccount.findMany({
                where: {
                    active: true,
                    accountClass: { not: "" } // Ensure we don't get empty strings if any
                },
                select: {
                    accountClass: true
                },
                distinct: ['accountClass'],
                orderBy: {
                    accountClass: 'asc'
                }
            });

            // Return just the array of strings
            reply.send({
                success: true,
                classes: classes.map(c => c.accountClass)
            });
        }
    );

    // Get GL accounts by account class (for AI agent filtering)
    // Get GL accounts by class (for AI agent) - REPLACED checkSession with stricter requireSession
    fastify.get<{ Params: IGLAccountClassParams }>(
        "/api/v1/gl-accounts/class/:accountClass",
        {
            preHandler: requireSession,
        },
        async (request, reply) => {
            const { accountClass } = request.params;

            const accounts = await prisma.gLAccount.findMany({
                where: {
                    accountClass,
                    active: true,
                },
                orderBy: { code: "asc" },
            });

            reply.send({ success: true, accounts });
        }
    );

    // Search GL accounts by keyword (for AI agent)
    fastify.get<{ Querystring: { q: string } }>(
        "/api/v1/gl-accounts/search",
        {
            preHandler: requireSession,
        },
        async (request, reply) => {
            const { q } = request.query;
            if (!q || q.trim().length < 2) {
                return reply.status(400).send({ success: false, error: "Query must be at least 2 characters" });
            }
            const accounts = await prisma.gLAccount.findMany({
                where: {
                    active: true,
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { code: { contains: q } },
                        { accountClassName: { contains: q, mode: 'insensitive' } },
                    ],
                },
                orderBy: { code: "asc" },
                take: 15,
                select: { code: true, name: true, accountClassName: true, taxCode: true, taxRate: true },
            });
            reply.send({ success: true, accounts });
        }
    );

    // Get all active expense (Aufwendungen) GL accounts — shortcut for AI agent
    fastify.get(
        "/api/v1/gl-accounts/expenses",
        {
            preHandler: requireSession,
        },
        async (request, reply) => {
            const accounts = await prisma.gLAccount.findMany({
                where: { active: true, accountClass: "8000" },
                orderBy: { code: "asc" },
                select: { code: true, name: true, taxCode: true, taxRate: true },
            });
            reply.send({ success: true, accounts });
        }
    );

    // Delete GL account (admin only)
    fastify.delete<{ Params: IGLAccountIdParams }>(
        "/api/v1/gl-accounts/:id",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.gLAccount.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "GL account not found" });
                }
                throw error;
            }
        }
    );

    // Bulk delete GL accounts (admin only)
    fastify.post<{ Body: IBulkDeleteBody }>(
        "/api/v1/gl-accounts/bulk-delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { ids } = request.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return reply.status(400).send({ success: false, error: "IDs array is required and cannot be empty" });
            }

            try {
                const result = await prisma.gLAccount.deleteMany({
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

    // Export GL accounts to CSV (admin only)
    fastify.get(
        "/api/v1/gl-accounts/export",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            // Helper to escape CSV fields
            const escapeCSV = (field: string | number | null | undefined) => {
                if (field === null || field === undefined) return "";
                let stringField = String(field).trim();

                // Prevent CSV Injection
                if (['=', '+', '-', '@'].includes(stringField.charAt(0))) {
                    stringField = "'" + stringField;
                }

                if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            };

            // Stream the response
            const BATCH_SIZE = 100;

            async function* csvGenerator() {
                yield "code,name,accountClass,accountClassName,taxCode,taxRate\n";

                let cursor: string | undefined;

                while (true) {
                    const batch = await prisma.gLAccount.findMany({
                        take: BATCH_SIZE,
                        orderBy: { code: "asc" as const },
                        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                    });

                    if (batch.length === 0) break;

                    for (const a of batch) {
                        yield `${escapeCSV(a.code)},${escapeCSV(a.name)},${escapeCSV(a.accountClass)},${escapeCSV(a.accountClassName)},${escapeCSV(a.taxCode)},${escapeCSV(a.taxRate)}\n`;
                    }

                    cursor = batch[batch.length - 1].id;

                    if (batch.length < BATCH_SIZE) break;
                }
            }

            return reply
                .header("Content-Type", "text/csv; charset=utf-8")
                .header("Content-Disposition", "attachment; filename=gl-accounts.csv")
                .send(csvGenerator());
        }
    );

    // Upload GL accounts from CSV (admin only)
    // Uses upsert on code — re-importing updates existing accounts
    fastify.post(
        "/api/v1/gl-accounts/upload",
        {
            preHandler: requireAdmin,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const parts = (request as any).parts();

            let totalProcessed = 0;
            let totalCreated = 0;
            let totalUpdated = 0;
            let totalErrors = 0;
            const errors: any[] = [];

            for await (const part of parts) {
                if (part.file) {
                    if (part.mimetype !== 'text/csv' && !part.filename.endsWith('.csv')) {
                        part.file.resume();
                        continue;
                    }

                    const parser = parse({
                        columns: true,
                        skip_empty_lines: true,
                        trim: true,
                        relax_quotes: true
                    });

                    let batch: (ICreateGLAccountBody & { active: boolean })[] = [];
                    const BATCH_SIZE = 50;

                    try {
                        for await (const record of part.file.pipe(parser)) {
                            totalProcessed++;

                            const { code, name, accountClass, accountClassName, taxCode, taxRate } = record;

                            if (!code || !name) {
                                totalErrors++;
                                if (errors.length < 50) errors.push({ line: totalProcessed, error: "Missing required fields (code, name)" });
                                continue;
                            }

                            const parsedTaxRate = parseFloat(taxRate);
                            if (isNaN(parsedTaxRate)) {
                                totalErrors++;
                                if (errors.length < 50) errors.push({ line: totalProcessed, code, error: `Invalid taxRate: ${taxRate}` });
                                continue;
                            }

                            batch.push({
                                code: code.trim(),
                                name: name.trim(),
                                accountClass: (accountClass || "").trim(),
                                accountClassName: (accountClassName || "").trim(),
                                taxCode: (taxCode || "").trim(),
                                taxRate: parsedTaxRate,
                                active: true,
                            });

                            if (batch.length >= BATCH_SIZE) {
                                const result = await processBatch(batch);
                                totalCreated += result.created;
                                totalUpdated += result.updated;
                                batch = [];
                            }
                        }

                        // Process remaining
                        if (batch.length > 0) {
                            const result = await processBatch(batch);
                            totalCreated += result.created;
                            totalUpdated += result.updated;
                        }

                    } catch (err: any) {
                        return reply.status(400).send({ success: false, error: `CSV Parsing error: ${err.message}` });
                    }
                }
            }

            async function processBatch(records: any[]): Promise<{ created: number; updated: number }> {
                const results = await Promise.all(records.map(async (record) => {
                    try {
                        const existing = await prisma.gLAccount.findUnique({
                            where: { code: record.code },
                            select: { id: true }
                        });

                        await prisma.gLAccount.upsert({
                            where: { code: record.code },
                            update: {
                                name: record.name,
                                accountClass: record.accountClass,
                                accountClassName: record.accountClassName,
                                taxCode: record.taxCode,
                                taxRate: record.taxRate,
                            },
                            create: record,
                        });

                        return { status: 'success', wasExisting: !!existing, code: record.code };
                    } catch (err: any) {
                        return { status: 'error', code: record.code, message: err.message };
                    }
                }));

                let created = 0;
                let updated = 0;

                for (const result of results) {
                    if (result.status === 'success') {
                        if (result.wasExisting) {
                            updated++;
                        } else {
                            created++;
                        }
                    } else {
                        totalErrors++;
                        if (errors.length < 50) errors.push({ code: result.code || 'unknown', error: result.message });
                    }
                }

                return { created, updated };
            }

            reply.send({
                success: true,
                message: `Processed ${totalProcessed} records. Created: ${totalCreated}. Updated: ${totalUpdated}. Errors: ${totalErrors}`,
                errors: errors.length > 0 ? errors : undefined
            });
        }
    );
}
