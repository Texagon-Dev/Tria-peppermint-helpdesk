FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl

# Copy workspace files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Copy Prisma schema before npm install (needed for postinstall)
COPY apps/api/src/prisma ./apps/api/src/prisma

# Install dependencies (this runs prisma generate via postinstall)
RUN npm install

# Copy remaining source and config files
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
COPY turbo.json ./
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Runner stage
FROM node:20-slim AS runner

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/src/prisma ./apps/api/src/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/api

EXPOSE 5003

CMD ["node", "dist/main.js"]
