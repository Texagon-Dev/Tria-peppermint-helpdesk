import cors from "@fastify/cors";
import "dotenv/config";
import Fastify from "fastify";
import multer from "fastify-multer";
import fs from "fs";

import { exec } from "child_process";
import { track } from "./lib/hog";
import { getEmails } from "./lib/imap";
import { checkToken } from "./lib/jwt";
import { prisma } from "./prisma";
import { registerRoutes } from "./routes";

// Ensure the directory exists
const logFilePath = "./logs.log"; // Update this path to a writable location

// Create a writable stream
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Initialize Fastify with logger
const server = Fastify({
  logger: {
    stream: logStream, // Use the writable stream
  },
  disableRequestLogging: true,
  trustProxy: true,
});

// Register CORS plugin (use type assertion to fix Fastify 5.x compatibility)
const corsOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
];
server.register(cors as any, {
  origin: [...new Set(corsOrigins)],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cookie"],
});

// Register multer for file uploads (use type assertion to fix compatibility)
server.register(multer.contentParser as any);

registerRoutes(server);

server.get(
  "/",
  {
    schema: {
      tags: ["health"], // This groups the endpoint under a category
      description: "Health check endpoint",
      response: {
        200: {
          type: "object",
          properties: {
            healthy: { type: "boolean" },
          },
        },
      },
    },
  },
  async function (request, response) {
    response.send({ healthy: true });
  }
);

// JWT authentication hook
server.addHook("preHandler", async function (request: any, reply: any) {
  try {
    // Skip auth for health check endpoint
    if (request.url === "/" && request.method === "GET") {
      return true;
    }
    if (request.url === "/api/v1/auth/login" && request.method === "POST") {
      return true;
    }
    if (
      request.url === "/api/v1/ticket/public/create" &&
      request.method === "POST"
    ) {
      return true;
    }
    // Skip auth for Gmail OAuth callback (Google redirects here without Bearer token)
    if (
      request.url.startsWith("/api/v1/email-queue/oauth/gmail") &&
      request.method === "GET"
    ) {
      return true;
    }
    // Skip auth for Gmail SMTP OAuth callback
    if (
      request.url.startsWith("/api/v1/config/email/oauth/gmail") &&
      request.method === "GET"
    ) {
      return true;
    }
    // Skip auth if API Key is present (handled by route middleware)
    if (request.headers["x-api-key"]) {
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new Error("No authorization header");
    }
    const bearer = authHeader.split(" ")[1];
    checkToken(bearer);
  } catch (err) {
    reply.status(401).send({
      message: "Unauthorized",
      success: false,
    });
  }
});

const start = async () => {
  try {
    // Skip Prisma commands in development mode (already run via npm install)
    // Only run in production to avoid Windows file lock issues
    const isDev = process.env.NODE_ENV !== "production";

    if (!isDev) {
      const execAsync = require("util").promisify(exec);
      try {
        console.log("Running: npx prisma migrate deploy");
        const { stdout: migrateOut, stderr: migrateErr } = await execAsync("npx prisma migrate deploy");
        if (migrateOut) console.log(migrateOut);
        if (migrateErr) console.error(migrateErr);

        console.log("Running: npx prisma generate");
        const { stdout: generateOut, stderr: generateErr } = await execAsync("npx prisma generate");
        if (generateOut) console.log(generateOut);
        if (generateErr) console.error(generateErr);

        console.log("Running: npx prisma db seed");
        const { stdout: seedOut, stderr: seedErr } = await execAsync("npx prisma db seed");
        if (seedOut) console.log(seedOut);
        if (seedErr) console.error(seedErr);
      } catch (err) {
        console.error("Failed to run Prisma commands:", err);
        process.exit(1);
      }
    } else {
      console.log("Development mode: Skipping Prisma migrate/generate/seed (run manually if needed)");
    }

    // connect to database
    await prisma.$connect();
    server.log.info("Connected to Prisma");

    // Use Railway's PORT env var, fallback to 5003 for local dev
    const port = process.env.PORT || 5003;

    server.listen(
      { port: Number(port), host: "0.0.0.0" },
      async (err, address) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }

        const client = track();

        client.capture({
          event: "server_started",
          distinctId: "uuid",
        });

        client.shutdownAsync();
        console.info(`Server listening on ${address}`);
      }
    );

    setInterval(() => getEmails(), 30000); // Check for new emails every 30 seconds
  } catch (err) {
    server.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

start();
