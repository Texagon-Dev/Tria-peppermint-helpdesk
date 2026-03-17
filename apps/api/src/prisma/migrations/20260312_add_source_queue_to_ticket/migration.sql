-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "sourceQueueId" TEXT;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sourceQueueId_fkey" FOREIGN KEY ("sourceQueueId") REFERENCES "EmailQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
