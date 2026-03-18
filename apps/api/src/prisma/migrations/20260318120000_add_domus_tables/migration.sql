-- CreateTable
CREATE TABLE "DomusUnit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyNumber" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "propertyDescription" TEXT,
    "searchTerm" TEXT,
    "addressNumber" TEXT,
    "tenantOwnerNumber" TEXT,
    "d130Number" TEXT,
    "address" TEXT,
    "street" TEXT,
    "poBox" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "salutation1" TEXT,
    "name1" TEXT,
    "salutation2" TEXT,
    "name2" TEXT,
    "name3" TEXT,
    "name4" TEXT,
    "phonePrivate" TEXT,
    "phonePrivate2" TEXT,
    "phoneBusiness" TEXT,
    "phoneBusiness2" TEXT,
    "fax" TEXT,
    "mobile" TEXT,
    "mobile2" TEXT,
    "email" TEXT,
    "email2" TEXT,
    "homepage" TEXT,
    "sector" TEXT,
    "unitDescription" TEXT,
    "equipment" TEXT,
    "taxNumber" TEXT,
    "taxExemptionDate" TIMESTAMP(3),
    "totalGrossRent" DOUBLE PRECISION,
    "moveInDate" TIMESTAMP(3),
    "moveOutDate" TIMESTAMP(3),
    "additional1" TEXT,
    "additional2" TEXT,
    "additional3" TEXT,
    "directDebitActive" BOOLEAN,
    "directDebitFrom" TIMESTAMP(3),
    "directDebitUntil" TIMESTAMP(3),
    "directDebitDay" INTEGER,
    "mandateReference" TEXT,
    "mandateValidFrom" TIMESTAMP(3),
    "mandateValidUntil" TIMESTAMP(3),
    "formDate" TIMESTAMP(3),
    "foreignAddressActive" BOOLEAN,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "addressLine3" TEXT,
    "addressLine4" TEXT,

    CONSTRAINT "DomusUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomusBankingInfo" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bankName" TEXT,
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "bic" TEXT,
    "iban" TEXT,
    "accountHolder" TEXT,
    "propertyBank" TEXT,
    "propertyBankCode" TEXT,
    "propertyBankAccount" TEXT,
    "propertyBankHolder" TEXT,
    "propertyBankBic" TEXT,
    "propertyBankIban" TEXT,
    "propertyBankCreditorName" TEXT,
    "propertyBankCreditorId" TEXT,
    "tenantLevBank" TEXT,
    "tenantLevBankCode" TEXT,
    "tenantLevBankAccount" TEXT,
    "tenantLevBankHolder" TEXT,
    "tenantLevBankBic" TEXT,
    "tenantLevBankIban" TEXT,
    "tenantLevCreditorName" TEXT,
    "tenantLevCreditorId" TEXT,

    CONSTRAINT "DomusBankingInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomusAllocationKey" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "keyIndex" INTEGER NOT NULL,
    "keyDescription" TEXT,
    "totalValue" DOUBLE PRECISION,
    "keyType" TEXT,
    "explanation" TEXT,
    "keyValue" DOUBLE PRECISION,
    "meterReadingNew" DOUBLE PRECISION,
    "meterReadingOld" DOUBLE PRECISION,
    "readingDate" TIMESTAMP(3),
    "variableValue" DOUBLE PRECISION,

    CONSTRAINT "DomusAllocationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomusScheduledCharge" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "chargeIndex" INTEGER NOT NULL,
    "d015Number" TEXT,
    "chargeText" TEXT,
    "paymentMethod" TEXT,
    "month" TEXT,
    "d210Number" TEXT,
    "chargeType" TEXT,
    "amount" DOUBLE PRECISION,

    CONSTRAINT "DomusScheduledCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomusJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "filename" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "skippedDetails" JSONB,
    "uploadedById" TEXT,

    CONSTRAINT "DomusJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomusConfig" (
    "id" TEXT NOT NULL,
    "lastUploadedFilename" TEXT,
    "lastFileUploadedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomusConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomusUnit_propertyNumber_unitNumber_idx" ON "DomusUnit"("propertyNumber", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DomusBankingInfo_unitId_key" ON "DomusBankingInfo"("unitId");

-- CreateIndex
CREATE INDEX "DomusAllocationKey_unitId_idx" ON "DomusAllocationKey"("unitId");

-- CreateIndex
CREATE INDEX "DomusScheduledCharge_unitId_idx" ON "DomusScheduledCharge"("unitId");

-- CreateIndex
CREATE INDEX "DomusJob_status_idx" ON "DomusJob"("status");

-- AddForeignKey
ALTER TABLE "DomusBankingInfo" ADD CONSTRAINT "DomusBankingInfo_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DomusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomusAllocationKey" ADD CONSTRAINT "DomusAllocationKey_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DomusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomusScheduledCharge" ADD CONSTRAINT "DomusScheduledCharge_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DomusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
