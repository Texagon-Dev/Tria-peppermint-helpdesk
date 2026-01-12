// Vendor controller request types
export interface ICreateVendorBody {
    name: string;
    email: string;
    category: string;
    description: string;
}

export interface IUpdateVendorBody {
    id: string;
    name?: string;
    email?: string;
    category?: string;
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

// Ticket controller request types
export interface ICommentBody {
    text: string;
    id: string;
    public?: boolean;
    senderRole?: 'customer' | 'vendor' | 'ai' | 'agent';
}
