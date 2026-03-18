import { TicketStatus, TicketType } from "@prisma/client";

// Vendor controller request types
export interface ICreateVendorBody {
    name: string;
    email: string;
    categoryId: string;
    description: string;
}

export interface IUpdateVendorBody {
    id: string;
    name?: string;
    email?: string;
    categoryId?: string;
    description?: string;
    active?: boolean;
}

export interface IBulkDeleteBody {
    ids: string[];
}

export interface IVendorIdParams {
    id: string;
}

export interface ICategoryParams {
    category: string;
}

// Vendor Category request types
export interface ICreateCategoryBody {
    name: string;
}

export interface ICategoryIdParams {
    id: string;
}

// Utility Company controller request types
export interface ICreateUtilityCompanyBody {
    name: string;
    email: string;
    categoryId: string;
    description: string;
}

export interface IUpdateUtilityCompanyBody {
    id: string;
    name?: string;
    email?: string;
    categoryId?: string;
    description?: string;
    active?: boolean;
}

export interface IUtilityCompanyIdParams { id: string; }
export interface IUtilityEmailParams { email: string; }
export interface IUtilityCategoryFilterParams { category: string; }
export interface ICreateUtilityCategoryBody { name: string; }
export interface IUtilityCategoryIdParams { id: string; }

// GL Account controller request types
export interface ICreateGLAccountBody {
    code: string;
    name: string;
    accountClass: string;
    accountClassName: string;
    taxCode: string;
    taxRate: number;
}

export interface IUpdateGLAccountBody {
    id: string;
    code?: string;
    name?: string;
    accountClass?: string;
    accountClassName?: string;
    taxCode?: string;
    taxRate?: number;
    active?: boolean;
}

export interface IGLAccountIdParams { id: string; }
export interface IGLAccountCodeParams { code: string; }
export interface IGLAccountClassParams { accountClass: string; }

// Ticket controller request types
export interface ICommentBody {
    text: string;
    id: string;
    public?: boolean;
    senderRole?: 'customer' | 'vendor' | 'ai' | 'agent';
}

export interface IVendorEmailBody {
    ticketId: string;
    vendorEmail: string;
    subject: string;
    body: string;
    messageId?: string;
}

// Maintenance Status request types
export interface IMaintenanceStatusParams {
    id: string;
}

export interface IUpdateMaintenanceStatusBody {
    status: string;
    vendorEmail?: string;  // Email of selected vendor (stored in ticket.metadata)
}

// Ticket update request types
export interface IUpdateTicketBody {
    id: string;
    note?: string;
    detail?: string;
    title?: string;
    priority?: string;
    status?: TicketStatus;
    type?: TicketType;
    workType?: string | null;
    client?: string;
}

// ==========================================
// UC3 Phase 2: Invoice request types
// ==========================================

// Note: Items use replacement semantics (delete all + recreate), not individual updates
export interface IInvoiceItemBody {
    description: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    total: number;
    costType?: string;
    glAccountId?: string;
    glAccountSuggested?: string;
}

export interface ICreateInvoiceBody {
    invoiceNumber: string;
    invoiceDate: string;  // ISO date string
    dueDate?: string;
    grossTotal: number;
    netTotal?: number;
    vatAmount?: number;
    vatRate?: number;
    taxType?: string;
    laborTotal?: number;
    laborTotalGross?: number;
    materialTotal?: number;
    propertyAddress?: string;
    propertyOwner?: string;
    tenantName?: string;
    unitReference?: string;
    skontoRate?: number;
    skontoAmount?: number;
    skontoDeadline?: string;
    vendorCustomerNumber?: string;
    vendorProjectNumber?: string;
    vendorTaxNumber?: string;
    insurancePolicyNumber?: string;
    coveragePeriod?: string;
    contractAccountNumber?: string;
    meterNumber?: string;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    pdfPath?: string;
    status?: string;
    aiConfidence?: number;
    sourceType?: string;
    caseNumber?: string;
    vendorId?: string;
    utilityCompanyId?: string;
    senderEmail?: string;
    items?: IInvoiceItemBody[];
}

export interface IUpdateInvoiceBody {
    id: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    grossTotal?: number;
    netTotal?: number;
    vatAmount?: number;
    vatRate?: number;
    taxType?: string;
    laborTotal?: number;
    laborTotalGross?: number;
    materialTotal?: number;
    propertyAddress?: string;
    propertyOwner?: string;
    tenantName?: string;
    unitReference?: string;
    skontoRate?: number;
    skontoAmount?: number;
    skontoDeadline?: string;
    vendorCustomerNumber?: string;
    vendorProjectNumber?: string;
    vendorTaxNumber?: string;
    insurancePolicyNumber?: string;
    coveragePeriod?: string;
    contractAccountNumber?: string;
    meterNumber?: string;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    pdfPath?: string;
    status?: string;
    aiConfidence?: number;
    sourceType?: string;
    caseNumber?: string;
    vendorId?: string;
    utilityCompanyId?: string;
}

export interface IInvoiceIdParams {
    id: string;
}

export interface IInvoicesFilterQuery {
    status?: string;
    vendorId?: string;
    utilityCompanyId?: string;
    startDate?: string;
    endDate?: string;
}

export interface IExportInvoicesQuery {
    startDate?: string;
    endDate?: string;
    preset?: string;  // "1d", "7d", "30d", "1y"
    format?: "domus" | "standard";  // defaults to "domus"
}
