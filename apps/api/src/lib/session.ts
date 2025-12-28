import { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { validateApiKey } from "./api-key";

// Checks session token or API key and returns user object
export async function checkSession(request: FastifyRequest) {
  try {
    // First, check for X-API-Key header (for service-to-service auth)
    const apiKeyResult = await validateApiKey(request);
    if (apiKeyResult) {
      // API key auth successful - return user with API key context
      return apiKeyResult.user;
    }

    // Fall back to JWT/session validation
    const bearer = request.headers.authorization?.split(" ")[1];
    if (!bearer) {
      return null;
    }

    // Verify JWT token is valid
    var b64string = process.env.SECRET;
    var secret = Buffer.from(b64string!, "base64");

    try {
      jwt.verify(bearer, secret);
    } catch (e) {
      // Token is invalid or expired
      await prisma.session.delete({
        where: { sessionToken: bearer },
      });
      return null;
    }

    // Check if session exists and is not expired
    const session = await prisma.session.findUnique({
      where: { sessionToken: bearer },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      // Session expired or doesn't exist
      if (session) {
        await prisma.session.delete({
          where: { id: session.id },
        });
      }
      return null;
    }

    // Verify the request is coming from the same client
    const currentUserAgent = request.headers["user-agent"];
    const currentIp = request.ip;

    if (
      session.userAgent !== currentUserAgent &&
      session.ipAddress !== currentIp
    ) {
      // Potential session hijacking attempt - invalidate the session
      await prisma.session.delete({
        where: { id: session.id },
      });

      return null;
    }

    return session.user;
  } catch (error) {
    return null;
  }
}

