// Check Github Version
// Add outbound email provider
// Email Verification
// SSO Provider
// Portal Locale
// Feature Flags
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { OAuth2Client } from "google-auth-library";
const nodemailer = require("nodemailer");

import { track } from "../lib/hog";
import { GMAIL_PENDING_EMAIL } from "../lib/constants";
import { createTransportProvider } from "../lib/nodemailer/transport";
import { requirePermission } from "../lib/roles";
import { checkSession } from "../lib/session";
import { prisma } from "../prisma";

async function tracking(event: string, properties: any) {
  const client = track();

  client.capture({
    event: event,
    properties: properties,
    distinctId: "uuid",
  });
}

export function configRoutes(fastify: FastifyInstance) {
  // Check auth method
  fastify.get(
    "/api/v1/config/authentication/check",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const config = await prisma.config.findFirst();

      //@ts-expect-error
      const { sso_active, sso_provider } = config;

      if (sso_active) {
        reply.send({
          success: true,
          sso: sso_active,
          provider: sso_provider,
        });
      }

      reply.send({
        success: true,
        sso: sso_active,
      });
    }
  );

  // Update OIDC Provider
  fastify.post(
    "/api/v1/config/authentication/oidc/update",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clientId, clientSecret, redirectUri, issuer, jwtSecret }: any =
        request.body;

      const conf = await prisma.config.findFirst();

      await prisma.config.update({
        where: { id: conf!.id },
        data: {
          sso_active: true,
          sso_provider: "oidc",
        },
      });

      const existingProvider = await prisma.openIdConfig.findFirst();

      if (existingProvider === null) {
        await prisma.openIdConfig.create({
          data: {
            clientId: clientId,
            redirectUri: redirectUri,
            issuer: issuer,
          },
        });
      } else {
        await prisma.openIdConfig.update({
          where: { id: existingProvider.id },
          data: {
            clientId: clientId,
            redirectUri: redirectUri,
            issuer: issuer,
          },
        });
      }

      await tracking("oidc_provider_updated", {});

      reply.send({
        success: true,
        message: "OIDC config Provider updated!",
      });
    }
  );

  // Update Oauth Provider
  fastify.post(
    "/api/v1/config/authentication/oauth/update",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const {
        name,
        clientId,
        clientSecret,
        redirectUri,
        tenantId,
        issuer,
        jwtSecret,
      }: any = request.body;

      const conf = await prisma.config.findFirst();

      // Update config to true
      await prisma.config.update({
        where: { id: conf!.id },
        data: {
          sso_active: true,
          sso_provider: "oauth",
        },
      });

      // Check if the provider exists
      const existingProvider = await prisma.oAuthProvider.findFirst();

      if (existingProvider === null) {
        await prisma.oAuthProvider.create({
          data: {
            name: name,
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: redirectUri,
            scope: "", // Add appropriate scope if needed
            authorizationUrl: "", // Add appropriate URL if needed
            tokenUrl: "", // Add appropriate URL if needed
            userInfoUrl: "", // Add appropriate URL if needed
          },
        });
      } else {
        await prisma.oAuthProvider.update({
          where: { id: existingProvider.id },
          data: {
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: redirectUri,
          },
        });
      }

      await tracking("oauth_provider_updated", {});

      reply.send({
        success: true,
        message: "SSO Provider updated!",
      });
    }
  );

  // Delete auth config
  fastify.delete(
    "/api/v1/config/authentication",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const conf = await prisma.config.findFirst();

      // Update config to false
      await prisma.config.update({
        where: { id: conf!.id },
        data: {
          sso_active: false,
          sso_provider: "",
        },
      });

      // Delete the OAuth provider
      await prisma.oAuthProvider.deleteMany({});

      await tracking("sso_provider_deleted", {});

      reply.send({
        success: true,
        message: "SSO Provider deleted!",
      });
    }
  );

  // Check if Emails are enabled & GET email settings
  fastify.get(
    "/api/v1/config/email",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const bearer = request.headers.authorization!.split(" ")[1];
      // GET EMAIL SETTINGS
      const config = await prisma.email.findFirst({
        select: {
          active: true,
          host: true,
          port: true,
          reply: true,
          user: true,
        },
      });

      if (config && config?.active) {
        const provider = await createTransportProvider();

        await new Promise((resolve, reject) => {
          provider.verify(function (error: any, success: any) {
            if (error) {
              console.log("ERROR", error);
              reply.send({
                success: true,
                active: true,
                email: config,
                verification: error,
              });
            } else {
              console.log("SUCCESS", success);
              console.log("Server is ready to take our messages");
              reply.send({
                success: true,
                active: true,
                email: config,
                verification: success,
              });
            }
          });
        });
      }

      reply.send({
        success: true,
        active: false,
      });
    }
  );

  // Get Gmail OAuth credentials from environment for SMTP
  const getSmtpGmailCredentials = () => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_SMTP_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Gmail SMTP OAuth credentials not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_SMTP_REDIRECT_URI environment variables."
      );
    }

    return { clientId, clientSecret, redirectUri };
  };

  // New endpoint: Get Gmail SMTP OAuth authorization URL
  fastify.post(
    "/api/v1/config/email/gmail/auth-url",

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, clientSecret, redirectUri } = getSmtpGmailCredentials();

        // Create or update email config with pending status
        const existingEmail = await prisma.email.findFirst();

        if (existingEmail) {
          await prisma.email.update({
            where: { id: existingEmail.id },
            data: {
              host: "smtp.gmail.com",
              port: "465",
              serviceType: "gmail",
              active: false,
              user: GMAIL_PENDING_EMAIL,
            },
          });
        } else {
          await prisma.email.create({
            data: {
              host: "smtp.gmail.com",
              port: "465",
              serviceType: "gmail",
              active: false,
              user: GMAIL_PENDING_EMAIL,
              reply: GMAIL_PENDING_EMAIL,
            },
          });
        }

        const google = new OAuth2Client(clientId, clientSecret, redirectUri);

        const authorizeUrl = google.generateAuthUrl({
          access_type: "offline",
          scope: [
            "https://mail.google.com",
            "https://www.googleapis.com/auth/userinfo.email",
          ],
          prompt: "consent",
        });

        await tracking("gmail_smtp_oauth_initiated", {});

        reply.send({
          success: true,
          message: "Gmail SMTP authorization URL generated!",
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

  // Update Email Provider Settings (for non-Gmail or manual config)
  fastify.put(
    "/api/v1/config/email",

    async (request: FastifyRequest, reply: FastifyReply) => {
      const {
        host,
        active,
        port,
        reply: replyto,
        username,
        password,
        serviceType,
      }: any = request.body;

      // For Gmail, redirect to use the new endpoint
      if (serviceType === "gmail") {
        reply.status(400).send({
          success: false,
          message: "For Gmail SMTP, please use /api/v1/config/email/gmail/auth-url endpoint",
        });
        return;
      }

      const email = await prisma.email.findFirst();

      if (email === null) {
        await prisma.email.create({
          data: {
            host: host,
            port: port,
            reply: replyto,
            user: username,
            pass: password,
            active: true,
            serviceType: serviceType || "other",
          },
        });
      } else {
        await prisma.email.update({
          where: { id: email.id },
          data: {
            host: host,
            port: port,
            reply: replyto,
            user: username,
            pass: password,
            active: active,
            serviceType: serviceType || "other",
          },
        });
      }

      reply.send({
        success: true,
        message: "Email settings updated!",
      });
    }
  );

  // Google oauth callback for SMTP
  fastify.get(
    "/api/v1/config/email/oauth/gmail",

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { code }: any = request.query;

        if (!code) {
          reply.status(400).send({
            success: false,
            message: "Missing authorization code",
          });
          return;
        }

        const { clientId, clientSecret, redirectUri } = getSmtpGmailCredentials();
        const google = new OAuth2Client(clientId, clientSecret, redirectUri);

        const r = await google.getToken(code);

        // Fetch user email from Google userinfo API
        const axios = require("axios");
        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${r.tokens.access_token}`,
            },
          }
        );

        const userEmail = userInfoResponse.data.email || "unknown@gmail.com";

        const email = await prisma.email.findFirst();
        if (!email) {
          throw new Error("Email configuration not found. Please restart the setup process.");
        }

        await prisma.email.update({
          where: { id: email.id },
          data: {
            user: userEmail,
            reply: userEmail,
            refreshToken: r.tokens.refresh_token,
            accessToken: r.tokens.access_token,
            expiresIn: r.tokens.expiry_date,
            serviceType: "gmail",
            active: true,
          },
        });

        await tracking("gmail_smtp_oauth_completed", {});

        // Redirect to frontend smtp page
        const frontendUrl = process.env.FRONTEND_URL || "";
        reply.redirect(`${frontendUrl}/admin/smtp?success=true`);
      } catch (error: any) {
        console.error("Gmail SMTP OAuth callback error:", error);
        const frontendUrl = process.env.FRONTEND_URL || "";
        reply.redirect(`${frontendUrl}/admin/smtp?error=${encodeURIComponent(error.message)}`);
      }
    }
  );

  // Disable/Enable Email
  fastify.delete(
    "/api/v1/config/email",

    async (request: FastifyRequest, reply: FastifyReply) => {
      await prisma.email.deleteMany({});

      reply.send({
        success: true,
        message: "Email settings deleted!",
      });
    }
  );

  // Toggle all roles
  fastify.patch(
    "/api/v1/config/toggle-roles",
    {
      preHandler: requirePermission(["settings::manage"]),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { isActive }: any = request.body;
      const session = await checkSession(request);

      // Double-check that user is admin
      if (!session?.isAdmin) {
        return reply.code(403).send({
          message: "Unauthorized. Admin access required.",
          success: false,
        });
      }

      const config = await prisma.config.findFirst();

      await prisma.config.update({
        where: { id: config!.id },
        data: {
          roles_active: isActive,
        },
      });

      reply.send({
        success: true,
        message: "Roles updated!",
      });
    }
  );
}
