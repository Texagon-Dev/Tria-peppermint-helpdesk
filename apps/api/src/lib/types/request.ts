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
}

