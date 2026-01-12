-- CreateTable
CREATE TABLE "VendorCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VendorCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorCategory_name_key" ON "VendorCategory"("name");

-- Step 1: Add the new categoryId column (nullable for now)
ALTER TABLE "Vendor" ADD COLUMN "categoryId" TEXT;

-- Step 2: Migrate existing category strings to VendorCategory table
-- Insert unique categories from existing vendors
INSERT INTO "VendorCategory" ("id", "name", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    "category",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "Vendor" WHERE "category" IS NOT NULL) AS unique_categories
ON CONFLICT ("name") DO NOTHING;

-- Step 3: Update Vendor records to reference the new VendorCategory IDs
UPDATE "Vendor" v
SET "categoryId" = vc."id"
FROM "VendorCategory" vc
WHERE v."category" = vc."name";

-- Step 4: Make categoryId NOT NULL now that all vendors have been updated
ALTER TABLE "Vendor" ALTER COLUMN "categoryId" SET NOT NULL;

-- Step 5: Drop the old category column
ALTER TABLE "Vendor" DROP COLUMN "category";

-- Step 6: Add foreign key constraint
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "VendorCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
