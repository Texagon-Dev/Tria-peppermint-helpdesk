# Peppermint - Railway Deployment Guide

> Deploy Peppermint Helpdesk to Railway alongside your existing services (Tria Backend, Flowise, etc.)

---

## Overview

This guide covers deploying Peppermint to **the same Railway project** as your other services, using a forked GitHub repository for better control and CI/CD.

---

## Prerequisites

- Railway account with active project
- GitHub account
- Existing Railway project with PostgreSQL (or willingness to add one)

---

## Step 1: Fork the Peppermint Repository

1. Go to **[github.com/Peppermint-Lab/peppermint](https://github.com/Peppermint-Lab/peppermint)**
2. Click **Fork** (top right corner)
3. This creates → `github.com/YOUR_USERNAME/peppermint`

> **Why fork?** Gives you control over updates and allows automatic Railway deployments on push.

---

## Step 2: Add Peppermint to Your Railway Project

### Option A: Deploy from GitHub Repo (Recommended)

1. Open your **existing Railway project** (where Tria Backend, Flowise, etc. are deployed)
2. Click **+ New** → **GitHub Repo**
3. Select your forked `peppermint` repository
4. Railway auto-detects the Dockerfile and starts building

### Option B: Deploy Docker Image Directly

1. Click **+ New** → **Docker Image**
2. Enter image: `pepperlabs/peppermint:latest`

---

## Step 3: Add PostgreSQL for Peppermint

Peppermint needs its own PostgreSQL database:

1. In the same project, click **+ New** → **Database** → **Add PostgreSQL**
2. Rename it to something clear like `peppermint-postgres`
3. Wait for it to provision

> **Note**: You can use the same Postgres instance as other services, but a dedicated one is cleaner for isolation.

---

## Step 4: Configure Environment Variables

Click on your **peppermint** service → **Variables** tab → Add:

### Required Variables

```env
# Database Connection (Reference Railway's Postgres service)
DB_HOST=${{peppermint-postgres.RAILWAY_PRIVATE_DOMAIN}}
DB_USERNAME=postgres
DB_PASSWORD=${{peppermint-postgres.POSTGRES_PASSWORD}}

# Security
SECRET=your-32-character-secret-key-here

# Port (Railway requires this)
PORT=3000
```

### Generate a Strong Secret

Run this command to generate a secure `SECRET`:

```bash
openssl rand -hex 32
```

Example output: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

### Variable Reference Syntax

Railway uses `${{SERVICE_NAME.VARIABLE_NAME}}` to reference variables from other services:

| Variable | Value | Description |
|----------|-------|-------------|
| `DB_HOST` | `${{peppermint-postgres.RAILWAY_PRIVATE_DOMAIN}}` | Internal hostname |
| `DB_PASSWORD` | `${{peppermint-postgres.POSTGRES_PASSWORD}}` | Auto-generated password |

---

## Step 5: Configure Networking

1. Go to **peppermint** service → **Settings** → **Networking**
2. Under **Public Networking**, click **Generate Domain**
3. You'll get a URL like: `peppermint-production-xxxx.up.railway.app`

### Ports

| Port | Purpose |
|------|---------|
| **3000** | Web UI (main) |
| **5003** | API (optional) |

---

## Step 6: Deploy & Verify

1. Railway should auto-deploy after adding variables
2. If not, go to **Deployments** → Click **Deploy**
3. Wait for build to complete (check logs for errors)
4. Access your Peppermint instance via the generated URL

---

## Step 7: First Login

**Default Credentials:**
```
Email: admin@admin.com
Password: 1234
```

> [!CAUTION]
> **Change these immediately after first login!**

---

## Troubleshooting

### 502 Bad Gateway Error

**Common Causes:**

| Issue | Fix |
|-------|-----|
| `DB_HOST` wrong | Use `${{SERVICE_NAME.RAILWAY_PRIVATE_DOMAIN}}` |
| Database not ready | Wait for Postgres to fully provision |
| `SECRET` missing | Add a 32+ character secret key |
| Port mismatch | Ensure `PORT=3000` is set |

**Check Logs:**
1. Go to **peppermint** service → **Deployments**
2. Click the latest deployment → **View Logs**
3. Look for database connection errors or startup failures

### Database Connection Errors

```
Error P1000: Can't reach database server
```

**Fix:**
- Verify `DB_HOST` references the correct Postgres service name
- Ensure Postgres service is in the same Railway project
- Check that `DB_USERNAME` and `DB_PASSWORD` match Postgres config

### Application Crashes on Start

1. Check if all required env variables are set
2. Ensure `SECRET` is at least 32 characters
3. Look for memory issues (upgrade Railway plan if needed)

---

## Your Railway Project Structure

After deployment, your project should look like:

```
Railway Project
├── Postgres (main)
├── Redis
├── triaApp-Backend
├── triaApp---Frontend
├── triaapp-mcp-server
├── Tria_Flowise
├── Postgres-flowise
├── pgvector
├── Staging Tria App
└── peppermint          ← NEW
    └── peppermint-postgres  ← NEW (or shared)
```

---

## Integration with Tria Backend

Once deployed, configure Peppermint to send webhooks to your Tria Backend:

### Webhook URL
```
https://triaapp-backend-production.up.railway.app/webhook/peppermint
```

### In Peppermint Admin:
1. Go to **Admin Settings** → **Webhooks**
2. Add your backend webhook URL
3. Select events: `ticket.created`, `ticket.updated`

---

## Next Steps

1. [ ] Configure email integration (SMTP/IMAP)
2. [ ] Set up webhooks to Tria Backend
3. [ ] Create email templates
4. [ ] Add team members
5. [ ] Configure SLA rules

---

## Useful Links

- **Peppermint Docs**: [docs.peppermint.sh](https://docs.peppermint.sh)
- **GitHub**: [Peppermint-Lab/peppermint](https://github.com/Peppermint-Lab/peppermint)
- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Discord**: [Peppermint Community](https://discord.gg/cyj86Ncygn)
