import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../prisma";
import { EmailQueue } from "../types/email";

export class AuthService {
  public static generateXOAuth2Token(
    username: string,
    accessToken: string
  ): string {
    const authString = [
      `user=${username}`,
      `auth=Bearer ${accessToken}`,
      "",
      "",
    ].join("\x01");
    return Buffer.from(authString).toString("base64");
  }

  static async getValidAccessToken(queue: EmailQueue): Promise<string> {
    const { refreshToken, accessToken, expiresIn } = queue;

    // Use environment variables for Gmail credentials (with fallback to queue for backwards compatibility)
    const clientId = process.env.GMAIL_CLIENT_ID || queue.clientId;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || queue.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error("Gmail OAuth credentials not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables.");
    }

    // Check if token is still valid (with 5 minute buffer)
    // expiresIn is BigInt from Prisma, so convert to Number for comparison
    const now = Math.floor(Date.now() / 1000);
    const expiresInNum = expiresIn ? Number(expiresIn) : 0;
    if (accessToken && expiresInNum && now < (expiresInNum - 300)) {
      return accessToken;
    }

    console.log(`[AuthService] Token expired for queue ${queue.id}, refreshing...`);

    if (!refreshToken) {
      throw new Error("No refresh token available. Please re-authenticate Gmail.");
    }

    // Initialize OAuth2Client for user consent flow (NOT GoogleAuth which is for service accounts)
    const oauth2Client = new OAuth2Client(clientId, clientSecret);

    // Set the refresh token credential
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Refresh the token
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("Unable to refresh access token - no token returned.");
      }

      // Calculate expiry time from response or default to 1 hour
      const expiryTimeSeconds = credentials.expiry_date
        ? Math.floor(credentials.expiry_date / 1000)
        : Math.floor(Date.now() / 1000) + 3600;
      const newExpiryDate = BigInt(expiryTimeSeconds);

      // Update the database with new token
      // Also save new refresh token if Google rotated it
      const updateData: { accessToken: string; expiresIn: bigint; refreshToken?: string } = {
        accessToken: credentials.access_token,
        expiresIn: newExpiryDate,
      };

      // Google may rotate refresh tokens - always save the latest one
      if (credentials.refresh_token && credentials.refresh_token !== refreshToken) {
        console.log(`[AuthService] Refresh token rotated for queue ${queue.id}`);
        updateData.refreshToken = credentials.refresh_token;
      }

      await prisma.emailQueue.update({
        where: { id: queue.id },
        data: updateData,
      });

      console.log(`[AuthService] Token refreshed successfully for queue ${queue.id}`);
      return credentials.access_token;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AuthService] Failed to refresh token for queue ${queue.id}:`, errorMessage);

      // Check for invalid_grant which means refresh token is completely invalid
      if (errorMessage.includes('invalid_grant')) {
        throw new Error(`Gmail refresh token is invalid. This can happen if: 1) User changed their password, 2) User revoked access, 3) App is in "Testing" mode (tokens expire after 7 days). Please re-authenticate Gmail.`);
      }

      throw new Error(`Gmail token refresh failed: ${errorMessage}. Please re-authenticate Gmail.`);
    }
  }
}
