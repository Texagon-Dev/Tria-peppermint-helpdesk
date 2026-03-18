import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import {
  parseCoreFields,
  parseBankingFields,
  parseAllocationKeys,
  parseScheduledCharges,
  validateRow,
} from "./csv-parser";

const BATCH_SIZE = 20;

async function updateJobStatus(
  jobId: string,
  data: Record<string, any>
): Promise<void> {
  await prisma.domusJob.update({ where: { id: jobId }, data });
}

export async function processDomusJob(
  jobId: string,
  filePath: string
): Promise<void> {
  try {
    // ── PARSING_CSV ──────────────────────────────────────────────────────
    await updateJobStatus(jobId, {
      status: "PARSING_CSV",
      startedAt: new Date(),
    });

    const fileStream = fs.createReadStream(filePath);
    const parser = fileStream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        delimiter: ",",
        bom: true,
      })
    );

    const allUnits: {
      core: Record<string, any>;
      banking: Record<string, any>;
      allocationKeys: Record<string, any>[];
      scheduledCharges: Record<string, any>[];
    }[] = [];

    let totalRows = 0;
    let skippedRows = 0;
    const skippedDetails: { row: number; error: string }[] = [];

    for await (const record of parser) {
      totalRows++;

      const validation = validateRow(record);
      if (!validation.valid) {
        skippedRows++;
        if (skippedDetails.length < 50) {
          skippedDetails.push({
            row: totalRows,
            error: validation.error || "Unknown error",
          });
        }
        continue;
      }

      allUnits.push({
        core: parseCoreFields(record),
        banking: parseBankingFields(record),
        allocationKeys: parseAllocationKeys(record),
        scheduledCharges: parseScheduledCharges(record),
      });
    }

    await updateJobStatus(jobId, {
      totalRows,
      skippedRows,
      skippedDetails: skippedDetails.length > 0 ? skippedDetails : undefined,
    });

    if (allUnits.length === 0) {
      await updateJobStatus(jobId, {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: "No valid rows found in CSV",
      });
      return;
    }

    // ── CLEARING_OLD_DATA ────────────────────────────────────────────────
    await updateJobStatus(jobId, { status: "CLEARING_OLD_DATA" });

    await prisma.$transaction([
      prisma.domusScheduledCharge.deleteMany(),
      prisma.domusAllocationKey.deleteMany(),
      prisma.domusBankingInfo.deleteMany(),
      prisma.domusUnit.deleteMany(),
    ]);

    // ── INSERTING_DATA ───────────────────────────────────────────────────
    await updateJobStatus(jobId, { status: "INSERTING_DATA" });

    let processedRows = 0;

    for (let i = 0; i < allUnits.length; i += BATCH_SIZE) {
      const batch = allUnits.slice(i, i + BATCH_SIZE);

      for (const unitData of batch) {
        const unit = await prisma.domusUnit.create({
          data: unitData.core as Prisma.DomusUnitCreateInput,
        });

        // Banking info (1:1)
        const hasBankingData = Object.values(unitData.banking).some(
          (v) => v !== null && v !== ""
        );
        if (hasBankingData) {
          await prisma.domusBankingInfo.create({
            data: { unitId: unit.id, ...unitData.banking },
          });
        }

        // Allocation keys (1:N)
        if (unitData.allocationKeys.length > 0) {
          await prisma.domusAllocationKey.createMany({
            data: unitData.allocationKeys.map((key) => ({
              unitId: unit.id,
              ...key,
            })) as Prisma.DomusAllocationKeyCreateManyInput[],
          });
        }

        // Scheduled charges (1:N)
        if (unitData.scheduledCharges.length > 0) {
          await prisma.domusScheduledCharge.createMany({
            data: unitData.scheduledCharges.map((charge) => ({
              unitId: unit.id,
              ...charge,
            })) as Prisma.DomusScheduledChargeCreateManyInput[],
          });
        }

        processedRows++;
      }

      // Update progress after each batch for SSE
      await updateJobStatus(jobId, { processedRows });
    }

    // ── COMPLETED ────────────────────────────────────────────────────────
    // Get the original filename from the job record
    const job = await prisma.domusJob.findUnique({ where: { id: jobId } });

    // Upsert DomusConfig with last upload info
    const existingConfig = await prisma.domusConfig.findFirst();
    if (existingConfig) {
      await prisma.domusConfig.update({
        where: { id: existingConfig.id },
        data: {
          lastUploadedFilename: job?.filename || "unknown",
          lastFileUploadedAt: new Date(),
        },
      });
    } else {
      await prisma.domusConfig.create({
        data: {
          lastUploadedFilename: job?.filename || "unknown",
          lastFileUploadedAt: new Date(),
        },
      });
    }

    await updateJobStatus(jobId, {
      status: "COMPLETED",
      completedAt: new Date(),
      processedRows,
    });
  } catch (err: any) {
    console.error(`Domus job ${jobId} failed:`, err);
    await updateJobStatus(jobId, {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: err.message || "Unknown error",
    }).catch(() => {});
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

export function startBackgroundJob(jobId: string, filePath: string): void {
  // Fire-and-forget — don't await
  processDomusJob(jobId, filePath).catch((err) => {
    console.error(`Domus job ${jobId} unhandled error:`, err);
  });
}
