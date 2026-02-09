-- CreateEnum (if not exists) with all values including vendor_contacting_tenant
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaintenanceStatus') THEN
        CREATE TYPE "MaintenanceStatus" AS ENUM (
            'pending',
            'quote_sent_to_vendor',
            'vendor_quote_received',
            'awaiting_customer_approval',
            'customer_approved',
            'vendor_contacting_tenant',
            'appointment_request_sent',
            'vendor_confirmed_appointment',
            'customer_notified_of_appointment',
            'work_completed',
            'cancelled'
        );
    ELSE
        -- If enum exists but doesn't have vendor_contacting_tenant, add it
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'vendor_contacting_tenant' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MaintenanceStatus')) THEN
            ALTER TYPE "MaintenanceStatus" ADD VALUE 'vendor_contacting_tenant';
        END IF;
    END IF;
END $$;

-- Add maintenanceStatus column to Ticket if not exists
DO $$ BEGIN
    IF to_regclass('public."Ticket"') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'Ticket'
             AND column_name = 'maintenanceStatus'
       ) THEN
        ALTER TABLE "Ticket" ADD COLUMN "maintenanceStatus" "MaintenanceStatus";
    END IF;
END $$;
