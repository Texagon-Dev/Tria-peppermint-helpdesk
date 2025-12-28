# API Key Authentication for Service Accounts

Add static API key authentication to Peppermint for service-to-service calls (e.g., Flowise AI integration).

## Problem

Current auth uses **8-hour JWT tokens** that require:
- User login to obtain token
- Token refresh before expiration
- Session validation (IP/User-Agent checks)

This is unsuitable for automated services like Flowise that need persistent API access.

## Proposed Solution

### 1. Database Schema

Add new table for API keys:

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  name        String   // e.g., "Flowise Integration"
  key         String   @unique // hashed API key
  prefix      String   // first 8 chars for identification (pk_abc123...)
  userId      String   // owner/creator
  user        User     @relation(fields: [userId], references: [id])
  permissions String[] // ["issue::read", "issue::comment"]
  active      Boolean  @default(true)
  lastUsedAt  DateTime?
  expiresAt   DateTime? // optional expiration
  createdAt   DateTime @default(now())
}
```

### 2. File Changes

#### [NEW] `lib/api-key.ts`
- `generateApiKey()` - Creates key in format `pk_<32-char-random>`
- `hashApiKey(key)` - SHA-256 hash for storage
- `validateApiKey(request)` - Check `X-API-Key` header

#### [MODIFY] `lib/session.ts`
- Update `checkSession()` to also check for API key header
- If `X-API-Key` header present, validate via API key lookup
- Return user with limited permissions based on key's scope

#### [NEW] `controllers/api-keys.ts`
- `POST /api/v1/api-keys` - Create new API key (admin only)
- `GET /api/v1/api-keys` - List user's API keys
- `DELETE /api/v1/api-keys/:id` - Revoke API key

### 3. Authentication Flow

```
┌─────────────────────────────────────────────┐
│            Incoming Request                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Check X-API-Key      │
         │ header present?      │
         └──────────────────────┘
           │ YES            │ NO
           ▼                ▼
    ┌──────────────┐  ┌──────────────┐
    │ Validate via │  │ Validate via │
    │ API Key      │  │ JWT Session  │
    └──────────────┘  └──────────────┘
           │                │
           └───────┬────────┘
                   ▼
         ┌──────────────────────┐
         │ Return User object   │
         │ with permissions     │
         └──────────────────────┘
```

### 4. Usage in Flowise

**Headers:**
```
X-API-Key: pk_a1b2c3d4e5f6...
Content-Type: application/json
```

No Bearer token needed - the API key bypasses JWT/session validation.

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Key storage | Store hashed, show key only once on creation |
| Key leakage | Prefix allows identification without exposing full key |
| Scope limit | API keys have explicit permission array |
| Audit trail | Track `lastUsedAt` for monitoring |
| Revocation | `active` flag for instant disable |

## Implementation Checklist

### Backend (Tria-peppermint-BE)

- [ ] Add Prisma migration for `ApiKey` model
- [ ] Create `lib/api-key.ts` utility functions
- [ ] Modify `checkSession()` to support API key auth
- [ ] Create API key management endpoints

### Frontend (Tria-peppermint-FE)

#### [NEW] `pages/admin/api-keys.tsx`

New admin page for managing API keys, following the pattern of `webhooks.tsx`:

**Features:**
- List all API keys (shows prefix, name, permissions, last used, created date)
- Create new API key (modal with name, permissions picker)
- Delete/revoke API key (with confirmation)
- Copy key to clipboard (only shown once on creation)

**API Calls:**
| Action | Endpoint |
|--------|----------|
| List keys | `GET /api/v1/api-keys` |
| Create key | `POST /api/v1/api-keys` |
| Delete key | `DELETE /api/v1/api-keys/:id` |

#### [MODIFY] Admin Navigation

Add "API Keys" link to admin sidebar/menu (likely in `components/Layout` or similar).

---

## UI Mockup

```
┌────────────────────────────────────────────────────────┐
│  API Key Settings                        [+ Create Key]│
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔑 Flowise Integration                           │  │
│  │    pk_a1b2c3d4...                                │  │
│  │    Permissions: issue::read, issue::comment      │  │
│  │    Last used: 2 hours ago          [Delete]      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔑 Monitoring Service                            │  │
│  │    pk_x9y8z7w6...                                │  │
│  │    Permissions: issue::read                      │  │
│  │    Last used: Never                [Delete]      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘

┌─────────────── Create API Key ───────────────┐
│                                              │
│  Name: [Flowise Integration        ]         │
│                                              │
│  Permissions:                                │
│  ☑ issue::read     ☑ issue::comment          │
│  ☐ issue::create   ☐ issue::update           │
│  ☐ user::read                                │
│                                              │
│  [Cancel]                    [Create Key]    │
└──────────────────────────────────────────────┘

┌─────────────── Key Created! ─────────────────┐
│                                              │
│  ⚠️ Copy this key now - you won't see it     │
│     again!                                   │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │ pk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4...  │ 📋  │
│  └─────────────────────────────────────┘     │
│                                              │
│                              [Done]          │
└──────────────────────────────────────────────┘
```

---

## Full Implementation Checklist

### Phase 1: Backend ✅
- [x] Prisma schema + migration for `ApiKey`
- [x] `lib/api-key.ts` (generate, hash, validate)
- [x] Update `checkSession()` for X-API-Key header
- [x] `controllers/api-keys.ts` endpoints

### Phase 2: Frontend ✅
- [x] `pages/admin/api-keys.tsx` page component
- [x] Add route to admin navigation
- [x] Create key modal with permissions picker
- [x] Copy-to-clipboard for new key display

### Phase 3: Integration ✅
- [x] Created API key for Flowise integration
- [x] Added key to Flowise credential store
- [ ] Test with Flowise HTTP node (end-to-end)

