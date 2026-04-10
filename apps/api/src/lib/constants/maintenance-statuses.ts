// Maintenance status definitions for AI agent and UI


export const MAINTENANCE_STATUSES = {
    pending: {
        order: 1,
        value: 'pending',
        label: 'Pending',
        description: 'New maintenance request received, awaiting initial processing',
        nextStatuses: ['awaiting_tenant_info', 'no_vendor_available', 'quote_sent_to_vendor', 'emergency_dispatched', 'cancelled']
    },
    no_vendor_available: {
        order: 2,
        value: 'no_vendor_available',
        label: 'No Vendor Available',
        description: 'No suitable vendor found for this maintenance category. Admin action required — add a vendor and retry.',
        nextStatuses: ['quote_sent_to_vendor', 'emergency_dispatched', 'cancelled']
    },
    awaiting_tenant_info: {
        order: 3,
        value: 'awaiting_tenant_info',
        label: 'Awaiting Tenant Info',
        description: 'Missing critical tenant information (property, unit, or phone). Clarification sent to tenant.',
        nextStatuses: ['awaiting_tenant_info', 'quote_sent_to_vendor', 'emergency_dispatched', 'cancelled']
    },
    emergency_dispatched: {
        order: 4,
        value: 'emergency_dispatched',
        label: 'Emergency Dispatched',
        description: 'Emergency detected. Vendor dispatched immediately without quote. Bypasses approval process.',
        nextStatuses: ['vendor_contacting_tenant', 'work_completed', 'cancelled']
    },
    quote_sent_to_vendor: {
        order: 5,
        value: 'quote_sent_to_vendor',
        label: 'Quote Sent to Vendor',
        description: 'Quote request sent to vendor. Customer received acknowledgment. Waiting for vendor reply.',
        nextStatuses: ['vendor_quote_received', 'cancelled']
    },
    vendor_quote_received: {
        order: 6,
        value: 'vendor_quote_received',
        label: 'Vendor Quote Received',
        description: 'Vendor replied with cost estimate. Proceeding to schedule appointment or request customer approval.',
        nextStatuses: ['appointment_request_sent', 'awaiting_customer_approval', 'vendor_contacting_tenant', 'cancelled']
    },
    awaiting_customer_approval: {
        order: 7,
        value: 'awaiting_customer_approval',
        label: 'Awaiting Customer Approval',
        description: 'Cost estimate sent to customer for approval. Waiting for customer to approve or decline.',
        nextStatuses: ['customer_approved', 'cancelled']
    },
    customer_approved: {
        order: 8,
        value: 'customer_approved',
        label: 'Customer Approved',
        description: 'Customer approved the cost estimate. Proceeding to schedule appointment with vendor.',
        nextStatuses: ['appointment_request_sent', 'vendor_contacting_tenant']
    },
    vendor_contacting_tenant: {
        order: 9,
        value: 'vendor_contacting_tenant',
        label: 'Vendor Contacting Tenant',
        description: 'Vendor instructed to contact tenant directly to arrange appointment.',
        nextStatuses: ['work_completed', 'cancelled']
    },
    appointment_request_sent: {
        order: 10,
        value: 'appointment_request_sent',
        label: 'Appointment Request Sent',
        description: 'Appointment request sent to vendor. Waiting for vendor to confirm date and time.',
        nextStatuses: ['vendor_confirmed_appointment', 'cancelled']
    },
    vendor_confirmed_appointment: {
        order: 11,
        value: 'vendor_confirmed_appointment',
        label: 'Vendor Confirmed Appointment',
        description: 'Vendor confirmed the appointment date and time. Ready to notify customer.',
        nextStatuses: ['customer_notified_of_appointment']
    },
    customer_notified_of_appointment: {
        order: 12,
        value: 'customer_notified_of_appointment',
        label: 'Customer Notified of Appointment',
        description: 'Customer has been informed of the scheduled appointment details.',
        nextStatuses: ['work_completed', 'cancelled']
    },
    work_completed: {
        order: 13,
        value: 'work_completed',
        label: 'Work Completed',
        description: 'Maintenance work completed. Ticket can be closed.',
        nextStatuses: []
    },
    cancelled: {
        order: 14,
        value: 'cancelled',
        label: 'Cancelled',
        description: 'Maintenance request was cancelled.',
        nextStatuses: []
    }
} as const;

export type MaintenanceStatusValue = keyof typeof MAINTENANCE_STATUSES;

/**
 * Type guard to validate if a value is a valid MaintenanceStatusValue
 */
export function isMaintenanceStatusValue(status: unknown): status is MaintenanceStatusValue {
    return typeof status === 'string' && status in MAINTENANCE_STATUSES;
}

export interface MaintenanceStatusInfo {
    order: number;
    value: string;
    label: string;
    description: string;
    nextStatuses: readonly string[];
}

/**
 * Get status info for a given status value
 */
export function getMaintenanceStatusInfo(status: MaintenanceStatusValue): MaintenanceStatusInfo {
    return MAINTENANCE_STATUSES[status];
}

/**
 * Get all statuses as an array, sorted by order
 */
export function getAllMaintenanceStatuses(): MaintenanceStatusInfo[] {
    return Object.values(MAINTENANCE_STATUSES).sort((a, b) => a.order - b.order);
}

/**
 * Check if a transition from currentStatus to newStatus is valid
 * Returns true if valid, false otherwise
 * Note: null -> any status is always valid (initial transition)
 */
export function isValidTransition(
    currentStatus: MaintenanceStatusValue | null,
    newStatus: MaintenanceStatusValue
): boolean {
    // Initial transition (null -> any) is always valid
    if (currentStatus === null) {
        return true;
    }

    const currentInfo = MAINTENANCE_STATUSES[currentStatus];
    return (currentInfo.nextStatuses as readonly string[]).includes(newStatus);
}
