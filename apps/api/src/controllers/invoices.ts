import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../lib/session";
import { prisma } from "../prisma";
import {
    ICreateInvoiceBody,
    IUpdateInvoiceBody,
    IInvoiceItemBody,
    IInvoiceIdParams,
    IInvoicesFilterQuery,
    IExportInvoicesQuery,
    IBulkDeleteBody
} from "../lib/types/request";

// Valid export preset values
const VALID_EXPORT_PRESETS = new Set(["1d", "7d", "30d", "1y"]);

/**
 * Parse and validate an ISO date string.
 * Returns null if value is undefined/null, throws descriptive error if invalid.
 */
function parseDate(value: string | undefined | null, fieldName: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw { isValidationError: true, field: fieldName, message: `${fieldName} must be a valid ISO date` };
    }
    return date;
}

// Typed filter interface for invoice queries (avoids 'any')
interface InvoiceFilter {
    status?: string;
    vendorId?: string;
    utilityCompanyId?: string;
    invoiceDate?: { gte?: Date; lte?: Date };
}

export function invoiceRoutes(fastify: FastifyInstance) {

    // ==========================================
    // INVOICE CRUD ENDPOINTS
    // ==========================================

    // Create invoice with items (admin only)
    fastify.post<{ Body: ICreateInvoiceBody }>(
        "/api/v1/invoice/create",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const {
                invoiceNumber,
                invoiceDate,
                dueDate,
                grossTotal,
                netTotal,
                vatAmount,
                vatRate,
                taxType,
                laborTotal,
                laborTotalGross,
                materialTotal,
                propertyAddress,
                propertyOwner,
                tenantName,
                unitReference,
                skontoRate,
                skontoAmount,
                skontoDeadline,
                vendorCustomerNumber,
                vendorProjectNumber,
                vendorTaxNumber,
                insurancePolicyNumber,
                coveragePeriod,
                contractAccountNumber,
                meterNumber,
                billingPeriodStart,
                billingPeriodEnd,
                pdfPath,
                status,
                aiConfidence,
                sourceType,
                caseNumber,
                vendorId,
                utilityCompanyId,
                items
            } = request.body;

            // Validate required fields
            if (!invoiceNumber || !invoiceDate || grossTotal === undefined) {
                return reply.status(400).send({
                    success: false,
                    error: "invoiceNumber, invoiceDate, and grossTotal are required",
                });
            }

            try {
                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber,
                        invoiceDate: new Date(invoiceDate),
                        dueDate: dueDate ? new Date(dueDate) : null,
                        grossTotal,
                        netTotal,
                        vatAmount,
                        vatRate,
                        taxType,
                        laborTotal,
                        laborTotalGross,
                        materialTotal,
                        propertyAddress,
                        propertyOwner,
                        tenantName,
                        unitReference,
                        skontoRate,
                        skontoAmount,
                        skontoDeadline: skontoDeadline ? new Date(skontoDeadline) : null,
                        vendorCustomerNumber,
                        vendorProjectNumber,
                        vendorTaxNumber,
                        insurancePolicyNumber,
                        coveragePeriod,
                        contractAccountNumber,
                        meterNumber,
                        billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : null,
                        billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
                        pdfPath,
                        status: status || "pending_review",
                        aiConfidence,
                        sourceType: sourceType || "standalone",
                        caseNumber,
                        vendorId,
                        utilityCompanyId,
                        // Create items if provided
                        items: items && items.length > 0 ? {
                            create: items.map(item => ({
                                description: item.description,
                                unit: item.unit,
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                total: item.total,
                                costType: item.costType,
                                glAccountId: item.glAccountId,
                                glAccountSuggested: item.glAccountSuggested,
                            }))
                        } : undefined,
                    },
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                });

                reply.send({ success: true, invoice });
            } catch (error: any) {
                if (error.code === "P2003") {
                    return reply.status(400).send({
                        success: false,
                        error: "Invalid vendorId, utilityCompanyId, or glAccountId reference",
                    });
                }
                throw error;
            }
        }
    );

    // Update invoice header (admin only)
    fastify.post<{ Body: IUpdateInvoiceBody }>(
        "/api/v1/invoice/update",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const {
                id,
                invoiceNumber,
                invoiceDate,
                dueDate,
                grossTotal,
                netTotal,
                vatAmount,
                vatRate,
                taxType,
                laborTotal,
                laborTotalGross,
                materialTotal,
                propertyAddress,
                propertyOwner,
                tenantName,
                unitReference,
                skontoRate,
                skontoAmount,
                skontoDeadline,
                vendorCustomerNumber,
                vendorProjectNumber,
                vendorTaxNumber,
                insurancePolicyNumber,
                coveragePeriod,
                contractAccountNumber,
                meterNumber,
                billingPeriodStart,
                billingPeriodEnd,
                pdfPath,
                status,
                aiConfidence,
                sourceType,
                caseNumber,
                vendorId,
                utilityCompanyId,
            } = request.body;

            if (!id) {
                return reply.status(400).send({ success: false, error: "Invoice ID is required" });
            }

            try {
                const invoice = await prisma.invoice.update({
                    where: { id },
                    data: {
                        invoiceNumber,
                        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
                        dueDate: dueDate ? new Date(dueDate) : undefined,
                        grossTotal,
                        netTotal,
                        vatAmount,
                        vatRate,
                        taxType,
                        laborTotal,
                        laborTotalGross,
                        materialTotal,
                        propertyAddress,
                        propertyOwner,
                        tenantName,
                        unitReference,
                        skontoRate,
                        skontoAmount,
                        skontoDeadline: skontoDeadline ? new Date(skontoDeadline) : undefined,
                        vendorCustomerNumber,
                        vendorProjectNumber,
                        vendorTaxNumber,
                        insurancePolicyNumber,
                        coveragePeriod,
                        contractAccountNumber,
                        meterNumber,
                        billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : undefined,
                        billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : undefined,
                        pdfPath,
                        status,
                        aiConfidence,
                        sourceType,
                        caseNumber,
                        vendorId,
                        utilityCompanyId,
                    },
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                });

                reply.send({ success: true, invoice });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Invoice not found" });
                }
                if (error.code === "P2003") {
                    return reply.status(400).send({
                        success: false,
                        error: "Invalid vendorId, utilityCompanyId, or glAccountId reference",
                    });
                }
                throw error;
            }
        }
    );

    // Get all invoices with optional filters (admin only)
    fastify.get<{ Querystring: IInvoicesFilterQuery }>(
        "/api/v1/invoices/all",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { status, vendorId, utilityCompanyId, startDate, endDate } = request.query;

            // Validate date filters
            try {
                const parsedStartDate = parseDate(startDate, "startDate");
                const parsedEndDate = parseDate(endDate, "endDate");

                const where: InvoiceFilter = {};

                if (status) where.status = status;
                if (vendorId) where.vendorId = vendorId;
                if (utilityCompanyId) where.utilityCompanyId = utilityCompanyId;
                if (parsedStartDate || parsedEndDate) {
                    where.invoiceDate = {
                        ...(parsedStartDate ? { gte: parsedStartDate } : {}),
                        ...(parsedEndDate ? { lte: parsedEndDate } : {}),
                    };
                }

                const invoices = await prisma.invoice.findMany({
                    where,
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                    orderBy: { createdAt: "desc" },
                });

                reply.send({ success: true, invoices });
            } catch (error: any) {
                if (error.isValidationError) {
                    return reply.status(400).send({ success: false, error: error.message });
                }
                throw error;
            }
        }
    );

    // Get single invoice by ID (admin only)
    fastify.get<{ Params: IInvoiceIdParams }>(
        "/api/v1/invoice/:id",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            const invoice = await prisma.invoice.findUnique({
                where: { id },
                include: {
                    vendor: true,
                    utilityCompany: true,
                    items: {
                        include: {
                            glAccount: true,
                        }
                    },
                },
            });

            if (!invoice) {
                return reply.status(404).send({ success: false, error: "Invoice not found" });
            }

            reply.send({ success: true, invoice });
        }
    );

    // Update invoice line items (admin only)
    fastify.post<{ Params: IInvoiceIdParams; Body: { items: IInvoiceItemBody[] } }>(
        "/api/v1/invoice/:id/items",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;
            const { items } = request.body;

            if (!items || !Array.isArray(items)) {
                return reply.status(400).send({ success: false, error: "Items array is required" });
            }

            try {
                // Check if invoice exists
                const existing = await prisma.invoice.findUnique({ where: { id } });
                if (!existing) {
                    return reply.status(404).send({ success: false, error: "Invoice not found" });
                }

                // Delete all existing items and recreate
                await prisma.$transaction(async (tx) => {
                    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

                    if (items.length > 0) {
                        await tx.invoiceItem.createMany({
                            data: items.map(item => ({
                                invoiceId: id,
                                description: item.description,
                                unit: item.unit,
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                total: item.total,
                                costType: item.costType,
                                glAccountId: item.glAccountId,
                                glAccountSuggested: item.glAccountSuggested,
                            }))
                        });
                    }
                });

                // Fetch updated invoice
                const invoice = await prisma.invoice.findUnique({
                    where: { id },
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                });

                reply.send({ success: true, invoice });
            } catch (error: any) {
                if (error.code === "P2003") {
                    return reply.status(400).send({
                        success: false,
                        error: "Invalid glAccountId reference in items",
                    });
                }
                throw error;
            }
        }
    );

    // Approve invoice (admin only)
    fastify.post<{ Params: IInvoiceIdParams }>(
        "/api/v1/invoice/:id/approve",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                const invoice = await prisma.invoice.update({
                    where: { id },
                    data: { status: "approved" },
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                });

                reply.send({ success: true, invoice });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Invoice not found" });
                }
                throw error;
            }
        }
    );

    // Reject invoice (admin only)
    fastify.post<{ Params: IInvoiceIdParams }>(
        "/api/v1/invoice/:id/reject",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                const invoice = await prisma.invoice.update({
                    where: { id },
                    data: { status: "rejected" },
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                });

                reply.send({ success: true, invoice });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Invoice not found" });
                }
                throw error;
            }
        }
    );

    // Delete invoice (admin only)
    fastify.delete<{ Params: IInvoiceIdParams }>(
        "/api/v1/invoices/:id/delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.invoice.delete({
                    where: { id },
                });

                reply.send({ success: true });
            } catch (error: any) {
                if (error.code === "P2025") {
                    return reply.status(404).send({ success: false, error: "Invoice not found" });
                }
                throw error;
            }
        }
    );

    // Bulk delete invoices (admin only)
    fastify.post<{ Body: IBulkDeleteBody }>(
        "/api/v1/invoices/bulk-delete",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            const { ids } = request.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return reply.status(400).send({ success: false, error: "IDs array is required and cannot be empty" });
            }

            try {
                const result = await prisma.invoice.deleteMany({
                    where: {
                        id: { in: ids }
                    },
                });

                reply.send({ success: true, count: result.count });
            } catch (error: any) {
                throw error;
            }
        }
    );

    // ==========================================
    // EXPORT ENDPOINT
    // ==========================================

    // Export approved invoices to CSV (admin only)
    // NOTE: POST method because this endpoint has side effects (marks invoices as exported)
    fastify.post<{ Body: IExportInvoicesQuery }>(
        "/api/v1/invoices/export",
        {
            preHandler: requireAdmin,
        },
        async (request, reply) => {
            let { startDate, endDate, preset } = request.body;

            // Validate preset if provided
            if (preset && !VALID_EXPORT_PRESETS.has(preset)) {
                return reply.status(400).send({
                    success: false,
                    error: `Invalid preset. Expected one of: ${Array.from(VALID_EXPORT_PRESETS).join(", ")}`,
                });
            }

            // Handle preset date ranges
            if (preset) {
                const now = new Date();
                endDate = now.toISOString();

                switch (preset) {
                    case "1d":
                        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case "7d":
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case "30d":
                        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case "1y":
                        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                }
            }

            // Validate date parameters
            try {
                const parsedStartDate = parseDate(startDate, "startDate");
                const parsedEndDate = parseDate(endDate, "endDate");

                const where: InvoiceFilter = {
                    status: "approved",
                };

                if (parsedStartDate || parsedEndDate) {
                    where.invoiceDate = {
                        ...(parsedStartDate ? { gte: parsedStartDate } : {}),
                        ...(parsedEndDate ? { lte: parsedEndDate } : {}),
                    };
                }

                const invoices = await prisma.invoice.findMany({
                    where,
                    include: {
                        vendor: true,
                        utilityCompany: true,
                        items: {
                            include: {
                                glAccount: true,
                            }
                        },
                    },
                    orderBy: { invoiceDate: "asc" },
                });

                // Helper to escape CSV fields
                const escapeCSV = (field: string | number | null | undefined) => {
                    if (field === null || field === undefined) return "";
                    const stringField = String(field);
                    if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
                        return `"${stringField.replace(/"/g, '""')}"`;
                    }
                    return stringField;
                };

                // Format date for CSV
                const formatDate = (date: Date | null | undefined) => {
                    if (!date) return "";
                    return date.toISOString().split('T')[0];
                };

                // Build CSV content
                const csvHeader = [
                    "invoiceNumber",
                    "invoiceDate",
                    "dueDate",
                    "vendorName",
                    "utilityCompanyName",
                    "grossTotal",
                    "netTotal",
                    "vatAmount",
                    "vatRate",
                    "taxType",
                    "laborTotal",
                    "materialTotal",
                    "propertyAddress",
                    "propertyOwner",
                    "tenantName",
                    "unitReference",
                    "status",
                    "sourceType",
                    "caseNumber",
                    "itemCount"
                ].join(",") + "\n";

                const csvRows = invoices.map(inv =>
                    [
                        escapeCSV(inv.invoiceNumber),
                        escapeCSV(formatDate(inv.invoiceDate)),
                        escapeCSV(formatDate(inv.dueDate)),
                        escapeCSV(inv.vendor?.name),
                        escapeCSV(inv.utilityCompany?.name),
                        escapeCSV(inv.grossTotal),
                        escapeCSV(inv.netTotal),
                        escapeCSV(inv.vatAmount),
                        escapeCSV(inv.vatRate),
                        escapeCSV(inv.taxType),
                        escapeCSV(inv.laborTotal),
                        escapeCSV(inv.materialTotal),
                        escapeCSV(inv.propertyAddress),
                        escapeCSV(inv.propertyOwner),
                        escapeCSV(inv.tenantName),
                        escapeCSV(inv.unitReference),
                        escapeCSV(inv.status),
                        escapeCSV(inv.sourceType),
                        escapeCSV(inv.caseNumber),
                        escapeCSV(inv.items.length)
                    ].join(",")
                ).join("\n");

                // Update exported invoices status (only approved ones)
                const invoiceIds = invoices.map(inv => inv.id);
                if (invoiceIds.length > 0) {
                    await prisma.invoice.updateMany({
                        where: { id: { in: invoiceIds }, status: "approved" },
                        data: { status: "exported" },
                    });
                }

                const filename = `invoices_export_${new Date().toISOString().split('T')[0]}.csv`;

                reply
                    .header("Content-Type", "text/csv; charset=utf-8")
                    .header("Content-Disposition", `attachment; filename=${filename}`)
                    .send(csvHeader + csvRows);
            } catch (error: any) {
                if (error.isValidationError) {
                    return reply.status(400).send({ success: false, error: error.message });
                }
                throw error;
            }
        }
    );
}
