# GL Accounts API

API endpoints for managing General Ledger (GL) accounts. These are the DOMUS 1000 Kontenrahmen accounts used for invoice coding in UC3.

---

## Endpoints

### GET `/api/v1/gl-accounts/all`

Returns all GL accounts ordered by code. **Requires admin.**

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "uuid",
      "code": "80500",
      "name": "bauliche Instandhaltung",
      "accountClass": "8000",
      "accountClassName": "Aufwendungen",
      "taxCode": "M19",
      "taxRate": 19.0,
      "active": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### GET `/api/v1/gl-account/:id`

Get a single GL account by UUID. **Requires admin.**

---

### GET `/api/v1/gl-account/code/:code`

Get a GL account by its DOMUS account code (e.g., `80500`). **Requires session** (used by AI agent for lookup).

---

### GET `/api/v1/gl-accounts/class/:accountClass`

Get all **active** GL accounts for a given account class. **Requires session** (used by AI agent).

Example: `GET /api/v1/gl-accounts/class/8000` → returns all 121 expense accounts.

Valid account classes: `6000` (Erträge), `8000` (Aufwendungen), `0000` (Anlagevermögen), `3000` (Eigenkapital), `4000` (Verbindlichkeiten), `9000` (Verrechnungskonten).

---

### POST `/api/v1/gl-account/create`

Create a new GL account. **Requires admin.**

**Body:**
```json
{
  "code": "80500",
  "name": "bauliche Instandhaltung",
  "accountClass": "8000",
  "accountClassName": "Aufwendungen",
  "taxCode": "M19",
  "taxRate": 19.0
}
```

Returns `400` if code already exists.

---

### POST `/api/v1/gl-account/update`

Update an existing GL account. **Requires admin.** All fields except `id` are optional.

**Body:**
```json
{
  "id": "uuid",
  "name": "New Name",
  "taxRate": 7.0,
  "active": false
}
```

---

### DELETE `/api/v1/gl-accounts/:id/delete`

Delete a single GL account. **Requires admin.**

---

### POST `/api/v1/gl-accounts/bulk-delete`

Delete multiple GL accounts at once. **Requires admin.**

**Body:**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

---

### GET `/api/v1/gl-accounts/export`

Export all GL accounts as CSV. **Requires admin.** Returns file download.

**CSV columns:** `code,name,accountClass,accountClassName,taxCode,taxRate`

---

### POST `/api/v1/gl-accounts/upload`

Import GL accounts from CSV file. **Requires admin.** Uses multipart form upload.

Uses **upsert on code** — re-importing an updated CSV will update existing accounts and create new ones.

**CSV format required:** `code,name,accountClass,accountClassName,taxCode,taxRate`

**Response:**
```json
{
  "success": true,
  "message": "Processed 166 records. Created: 166. Updated: 0. Errors: 0"
}
```
