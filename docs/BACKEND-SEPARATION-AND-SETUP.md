# Backend Separation & Setup Guide

This document covers the complete separation of the backend from the monorepo.

---

## What Was Done

### 1. Deleted Frontend & Unused Apps

```
❌ apps/client/        → Frontend (moved to separate repo)
❌ apps/docs/          → Documentation site
❌ apps/landing/       → Landing page
```

### 2. Deleted Old Docker/PM2 Files

```
❌ dockerfile
❌ docker-compose.yml
❌ docker-compose.dev.yml
❌ docker-compose.local.yml
❌ ecosystem.config.js
```

### 3. Updated package.json

- Renamed to `peppermint-backend`
- Removed `next`, `react`, `nextra` dependencies
- Removed `packageManager: yarn@4.2.2` (now uses npm)
- Updated scripts to filter to `api` only
- Added `db:generate` and `db:push` scripts

### 4. Updated turbo.json

- Removed `.next/**` from build outputs
- Added `DATABASE_URL`, `SECRET`, `FRONTEND_URL` to global env

### 5. Updated CORS Configuration

In `apps/api/src/main.ts`, updated CORS to allow frontend:

```typescript
server.register(cors, {
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "http://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cookie"],
});
```

### 6. Created New Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Fastify + Prisma build for Railway |
| `railway.json` | Railway deployment configuration |

### 7. Updated .env.example

Added `FRONTEND_URL` for CORS configuration.

---

## Current Structure

```
peppermint-backend/
├── apps/
│   └── api/            ← Fastify + Prisma backend
│       ├── src/
│       │   ├── main.ts ← CORS configured here
│       │   └── prisma/
│       └── .env.example
├── Dockerfile          ← NEW
├── railway.json        ← NEW
├── package.json        ← UPDATED
└── turbo.json          ← UPDATED
```

---

## How to Run Locally

```bash
# Install dependencies
npm install

# Set up database (if not already)
cd apps/api
cp .env.example .env
# Edit .env with your database credentials

# Run Prisma migrations
npm run db:push

# Start dev server
npm run dev

# API runs at http://localhost:5003
```

---

## How to Deploy to Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. Add PostgreSQL service (or use existing)
4. Set environment variables:
   ```
   DATABASE_URL = <Railway PostgreSQL connection string>
   SECRET = your-jwt-secret
   FRONTEND_URL = https://your-frontend.railway.app
   ```
5. Generate domain

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ Yes |
| `SECRET` | JWT signing secret | ✅ Yes |
| `FRONTEND_URL` | Frontend URL for CORS | ✅ Yes |
| `PORT` | API port (default: 5003) | No |
| `GMAIL_CLIENT_ID` | Google OAuth client ID | If using Gmail |
| `GMAIL_CLIENT_SECRET` | Google OAuth secret | If using Gmail |

---

## What Frontend Needs to Do

For the frontend to connect to this backend:

### 1. Set API URL in Frontend

In frontend `.env`:

```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

### 2. Deploy Order

1. **Deploy backend first** → Get Railway domain
2. **Set `FRONTEND_URL`** in backend env with frontend domain
3. **Deploy frontend** → Set `NEXT_PUBLIC_API_URL` with backend domain

---

## API Health Check

The backend has a health check endpoint at:

```
GET / → { "healthy": true }
```

Railway uses this for health monitoring.

---

## Quick Checklist

- [x] Frontend deleted from this repo
- [x] Docker files updated for backend-only
- [x] package.json cleaned up
- [x] turbo.json cleaned up
- [x] CORS configured for frontend URL
- [x] .env.example updated with FRONTEND_URL
- [ ] Deploy to Railway
- [ ] Set FRONTEND_URL with actual frontend domain
- [ ] Frontend sets NEXT_PUBLIC_API_URL
