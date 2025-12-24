import { GoogleAuth } from "google-auth-library";
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
    const { clientId, clientSecret, refreshToken, accessToken, expiresIn } =
      queue;

    // Check if token is still valid (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    if (accessToken && expiresIn && now < (expiresIn - 300)) {
      return accessToken;
    }

    console.log(`[AuthService] Token expired for queue ${queue.id}, refreshing...`);

    if (!refreshToken) {
      throw new Error("No refresh token available. Please re-authenticate Gmail.");
    }

    // Initialize GoogleAuth client
    const auth = new GoogleAuth({
      clientOptions: {
        clientId: clientId,
        clientSecret: clientSecret,
      },
    });

    const oauth2Client = auth.fromJSON({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    // Refresh the token if expired
    try {
      const tokenInfo = await oauth2Client.getAccessToken();

      // Calculate new expiry time: current time + 1 hour (3600 seconds)
      const newExpiryDate = Math.floor(Date.now() / 1000) + 3600;

      if (tokenInfo.token) {
        await prisma.emailQueue.update({
          where: { id: queue.id },
          data: {
            accessToken: tokenInfo.token,
            expiresIn: newExpiryDate,
          },
        });

        console.log(`[AuthService] Token refreshed successfully for queue ${queue.id}`);
        return tokenInfo.token;
      } else {
        throw new Error("Unable to refresh access token - no token returned.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AuthService] Failed to refresh token for queue ${queue.id}:`, errorMessage);
      throw new Error(`Gmail token refresh failed: ${errorMessage}. Please re-authenticate Gmail.`);
    }
  }
}
