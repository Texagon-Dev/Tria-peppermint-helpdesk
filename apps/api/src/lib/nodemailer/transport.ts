import { prisma } from "../../prisma";
import { normalizeExpiryToSeconds } from "../constants";
import { AuthService } from "../services/auth.service";
import { EmailQueue } from "../types/email";

const nodemailer = require("nodemailer");

export async function createTransportProvider(queueId?: string) {
  // When queueId is provided: send FROM the receiving inbox (unified OAuth)
  if (queueId) {
    const queue = await prisma.emailQueue.findFirst({ where: { id: queueId } });
    if (queue) {
      if (queue.serviceType === "gmail") {
        const validAccessToken = await AuthService.getValidAccessToken(queue as EmailQueue);
        return nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            type: "OAuth2",
            user: queue.username,
            clientId: queue.clientId || process.env.GMAIL_CLIENT_ID,
            clientSecret: queue.clientSecret || process.env.GMAIL_CLIENT_SECRET,
            refreshToken: queue.refreshToken,
            accessToken: validAccessToken,
          },
        });
      }

      if (queue.serviceType === "microsoft") {
        const validAccessToken = await AuthService.getMicrosoftValidAccessToken(queue as EmailQueue);
        return nodemailer.createTransport({
          host: "smtp.office365.com",
          port: 587,
          secure: false, // STARTTLS (Nodemailer upgrades automatically on port 587)
          auth: {
            type: "OAuth2",
            user: queue.username,
            clientId: queue.clientId || process.env.MICROSOFT_CLIENT_ID,
            clientSecret: queue.clientSecret || process.env.MICROSOFT_CLIENT_SECRET,
            refreshToken: queue.refreshToken,
            accessToken: validAccessToken,
            accessUrl: `https://login.microsoftonline.com/${queue.tenantId || 'organizations'}/oauth2/v2.0/token`,
          },
        });
      }

      // "other" queue type: no SMTP port/host config in EmailQueue model, fall through to Email table
    }
  }

  // Fall back to Email table (system notifications, manually created tickets, "other" queues)
  const provider = await prisma.email.findFirst({});

  if (!provider) {
    throw new Error("No email provider configured.");
  }

  if (provider?.serviceType === "gmail") {
    const clientId = provider?.clientId || process.env.GMAIL_CLIENT_ID;
    const clientSecret = provider?.clientSecret || process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Gmail OAuth credentials (clientId or clientSecret) are missing in both database and environment variables.");
    }

    return nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: provider?.user,
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: provider?.refreshToken,
        accessToken: provider?.accessToken,
        expires: provider?.expiresIn ? normalizeExpiryToSeconds(provider.expiresIn) * 1000 : undefined,
      },
    });
  } else if (provider?.serviceType === "microsoft") {
    const clientId = provider?.clientId || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = provider?.clientSecret || process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth credentials (clientId or clientSecret) are missing.");
    }

    return nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        type: "OAuth2",
        user: provider?.user,
        clientId,
        clientSecret,
        refreshToken: provider?.refreshToken,
        accessToken: provider?.accessToken,
        expires: provider?.expiresIn ? normalizeExpiryToSeconds(provider.expiresIn) * 1000 : undefined,
        accessUrl: `https://login.microsoftonline.com/${provider?.tenantId || 'organizations'}/oauth2/v2.0/token`,
      },
    });
  } else if (provider?.serviceType === "other") {
    // Username/password configuration
    return nodemailer.createTransport({
      host: provider.host,
      port: provider?.port,
      secure: provider?.port === "465" ? true : false, // true for 465, false for other ports
      auth: {
        user: provider?.user,
        pass: provider?.pass,
      },
    });
  } else {
    throw new Error("No valid authentication method configured.");
  }
}
