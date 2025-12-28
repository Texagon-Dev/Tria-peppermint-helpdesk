import crypto from "crypto";
import { FastifyRequest } from "fastify";
import { prisma } from "../prisma";

/**
 * Generates a new API key in the format pk_<32-char-random>
 * Returns both the raw key (to show once) and the prefix (for display)
 */
export function generateApiKey(): { rawKey: string; prefix: string } {
  const randomPart = crypto.randomBytes(24).toString("base64url"); // 32 chars
  const rawKey = `pk_${randomPart}`;
  const prefix = rawKey.substring(0, 11); // "pk_" + first 8 chars
  return { rawKey, prefix };
}

/**
 * Hash an API key using SHA-256 for secure storage
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key from X-API-Key header
 * Returns the user object with permissions, or null if invalid
 */
export async function validateApiKey(request: FastifyRequest): Promise<{
  user: any;
  permissions: string[];
} | null> {
  try {
    const apiKey = request.headers["x-api-key"] as string | undefined;

    if (!apiKey) {
      return null;
    }

    // Hash the incoming key to compare with stored hash
    const hashedKey = hashApiKey(apiKey);

    // Find the API key in database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: { user: true },
    });

    if (!apiKeyRecord) {
      return null;
    }

    // Check if key is active
    if (!apiKeyRecord.active) {
      return null;
    }

    // Check if key has expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      return null;
    }

    // Update lastUsedAt timestamp
    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      user: apiKeyRecord.user,
      permissions: apiKeyRecord.permissions,
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return null;
  }
}
