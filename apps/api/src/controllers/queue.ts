import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import { track } from "../lib/hog";
import { GMAIL_PENDING_NAME, GMAIL_PENDING_EMAIL, GMAIL_DEFAULT_EXPIRY_OFFSET_SECONDS } from "../lib/constants";
import { prisma } from "../prisma";

async function tracking(event: string, properties: any) {
  const client = track();

  client.capture({
    event: event,
    properties: properties,
    distinctId: "uuid",
  });

  client.shutdownAsync();
}

export function emailQueueRoutes(fastify: FastifyInstance) {
  // Get Gmail OAuth credentials from environment
  const getGmailCredentials = () => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_EMAIL_QUEUE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Gmail OAuth credentials not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_EMAIL_QUEUE_REDIRECT_URI environment variables."
      );
    }

    return { clientId, clientSecret, redirectUri };
  };

  // New endpoint: Get Gmail OAuth authorization URL
  fastify.post(
    "/api/v1/email-queue/gmail/auth-url",

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, clientSecret, redirectUri } = getGmailCredentials();

        // Create a temporary email queue record
        const mailbox = await prisma.emailQueue.create({
          data: {
            name: GMAIL_PENDING_NAME,
            username: GMAIL_PENDING_EMAIL,
            hostname: "imap.gmail.com",
            serviceType: "gmail",
          },
        });

        const google = new OAuth2Client(clientId, clientSecret, redirectUri);

        const authorizeUrl = google.generateAuthUrl({
          access_type: "offline",
          scope: [
            "https://mail.google.com",
            "https://www.googleapis.com/auth/userinfo.email",
          ],
          prompt: "consent",
          state: mailbox.id,
        });

        tracking("gmail_oauth_initiated", {
          provider: "gmail",
        });

        reply.send({
          success: true,
          message: "Gmail authorization URL generated!",
          authorizeUrl: authorizeUrl,
        });
      } catch (error: any) {
        reply.status(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Create a new email queue (for non-Gmail providers)
  fastify.post(
    "/api/v1/email-queue/create",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const {
        name,
        username,
        password,
        hostname,
        tls,
        serviceType,
      } = request.body as { name: string; username: string; password: string; hostname: string; tls?: boolean; serviceType?: string };

      // For Gmail, redirect to use the new /gmail/auth-url endpoint
      if (serviceType === "gmail") {
        reply.status(400).send({
          success: false,
          message: "For Gmail, please use /api/v1/email-queue/gmail/auth-url endpoint",
        });
        return;
      }

      const mailbox = await prisma.emailQueue.create({
        data: {
          name: name,
          username,
          password,
          hostname,
          tls,
          serviceType,
        },
      });

      tracking("imap_provider_created", {
        provider: serviceType,
      });

      reply.send({
        success: true,
        message: "Email queue created!",
      });
    }
  );

  // Google oauth callback
  fastify.get(
    "/api/v1/email-queue/oauth/gmail",

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { code, state } = request.query as { code?: string; state?: string };

        if (!code || !state) {
          reply.status(400).send({
            success: false,
            message: "Missing authorization code or state parameter",
          });
          return;
        }

        const mailbox = await prisma.emailQueue.findFirst({
          where: { id: state },
        });

        if (!mailbox) {
          reply.status(404).send({
            success: false,
            message: "Email queue not found",
          });
          return;
        }

        const { clientId, clientSecret, redirectUri } = getGmailCredentials();
        const google = new OAuth2Client(clientId, clientSecret, redirectUri);

        const r = await google.getToken(code);

        // Fetch user email from Google userinfo API
        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${r.tokens.access_token}`,
            },
          }
        );

        const userEmail = userInfoResponse.data.email || "unknown@gmail.com";

        await prisma.emailQueue.update({
          where: { id: mailbox.id },
          data: {
            name: userEmail,
            username: userEmail,
            refreshToken: r.tokens.refresh_token,
            accessToken: r.tokens.access_token,
            expiresIn: Math.floor((r.tokens.expiry_date || (Date.now() + GMAIL_DEFAULT_EXPIRY_OFFSET_SECONDS * 1000)) / 1000),
            serviceType: "gmail",
          },
        });

        tracking("gmail_oauth_completed", {
          provider: "gmail",
        });

        // Redirect to frontend email queues page
        const frontendUrl = process.env.FRONTEND_URL || "";
        reply.redirect(`${frontendUrl}/admin/email-queues?success=true`);
      } catch (error: any) {
        console.error("Gmail OAuth callback error:", error);
        const frontendUrl = process.env.FRONTEND_URL || "";
        reply.redirect(`${frontendUrl}/admin/email-queues?error=${encodeURIComponent(error.message)}`);
      }
    }
  );

  // Get all email queue's
  fastify.get(
    "/api/v1/email-queues/all",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const queues = await prisma.emailQueue.findMany({
        select: {
          id: true,
          name: true,
          serviceType: true,
          active: true,
          teams: true,
          username: true,
          hostname: true,
          tls: true,
          clientId: true,
          redirectUri: true,
        },
      });

      reply.send({
        success: true,
        queues: queues,
      });
    }
  );

  // Delete an email queue
  fastify.delete(
    "/api/v1/email-queue/delete",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.body as { id: string };

      await prisma.emailQueue.delete({
        where: {
          id: id,
        },
      });

      reply.send({
        success: true,
      });
    }
  );

  // Manual email fetch endpoint
  fastify.post(
    "/api/v1/email-queue/fetch",

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { getEmails } = await import("../lib/imap");
        await getEmails();

        reply.send({
          success: true,
          message: "Email fetch triggered successfully",
        });
      } catch (error) {
        console.error("Manual email fetch failed:", error);
        reply.status(500).send({
          success: false,
          message: error instanceof Error ? error.message : "Failed to fetch emails",
        });
      }
    }
  );
}
