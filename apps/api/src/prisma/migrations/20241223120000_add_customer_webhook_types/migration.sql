-- Add new values to Hook enum for customer webhook triggers
ALTER TYPE "Hook" ADD VALUE 'customer_ticket_created';
ALTER TYPE "Hook" ADD VALUE 'customer_reply_received';
