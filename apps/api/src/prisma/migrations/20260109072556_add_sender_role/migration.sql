/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `Comment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[threadId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('customer', 'vendor', 'ai', 'agent');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "inReplyTo" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "senderRole" "SenderRole" NOT NULL DEFAULT 'customer';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "externalIds" TEXT[],
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "threadId" TEXT;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_email_key" ON "Vendor"("email");

-- Cleanup duplicate Comment.messageId values (keep earliest, NULL out rest)
WITH ranked AS (
  SELECT id, "messageId",
         ROW_NUMBER() OVER (PARTITION BY "messageId" ORDER BY "createdAt" ASC) AS rn
  FROM "Comment"
  WHERE "messageId" IS NOT NULL
)
UPDATE "Comment" c
SET "messageId" = NULL
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Comment_messageId_key" ON "Comment"("messageId");

-- Cleanup duplicate Ticket.threadId values (keep earliest, NULL out rest)
WITH ranked AS (
  SELECT id, "threadId",
         ROW_NUMBER() OVER (PARTITION BY "threadId" ORDER BY "createdAt" ASC) AS rn
  FROM "Ticket"
  WHERE "threadId" IS NOT NULL
)
UPDATE "Ticket" t
SET "threadId" = NULL
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_threadId_key" ON "Ticket"("threadId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
