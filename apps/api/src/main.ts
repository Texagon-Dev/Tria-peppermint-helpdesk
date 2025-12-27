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
server.register(cors as any, {
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "http://localhost:3000",
  ],
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
    if (request.url === "/api/v1/auth/login" && request.method === "POST") {
      return true;
    }
    if (
      request.url === "/api/v1/ticket/public/create" &&
      request.method === "POST"
    ) {
      return true;
    }
    const bearer = request.headers.authorization!.split(" ")[1];
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
      // Run prisma generate and migrate commands before starting the server
      await new Promise<void>((resolve, reject) => {
        exec("npx prisma migrate deploy", (err, stdout, stderr) => {
          if (err) {
            console.error(err);
            reject(err);
          }
          console.log(stdout);
          console.error(stderr);

          exec("npx prisma generate", (err, stdout, stderr) => {
            if (err) {
              console.error(err);
              reject(err);
            }
            console.log(stdout);
            console.error(stderr);
          });

          exec("npx prisma db seed", (err, stdout, stderr) => {
            if (err) {
              console.error(err);
              reject(err);
            }
            console.log(stdout);
            console.error(stderr);
            resolve();
          });
        });
      });
    } else {
      console.log("Development mode: Skipping Prisma migrate/generate/seed (run manually if needed)");
    }

    // connect to database
    await prisma.$connect();
    server.log.info("Connected to Prisma");

    const port = 5003;

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

    setInterval(() => getEmails(), 10000); // Check for new emails every 10 seconds
  } catch (err) {
    server.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

start();
