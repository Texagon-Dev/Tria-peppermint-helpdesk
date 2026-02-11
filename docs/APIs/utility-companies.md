# Utility Company APIs

API endpoints for managing utility companies (e.g. gas, water, electricity providers).

## Table of Contents

- [Endpoints Overview](#endpoints-overview)
- [Create Utility Company](#create-utility-company)
- [Update Utility Company](#update-utility-company)
- [Get All Utility Companies](#get-all-utility-companies)
- [Get Single Utility Company](#get-single-utility-company)
- [Get Utility Company by Email](#get-utility-company-by-email)
- [Delete Utility Company](#delete-utility-company)
- [Bulk Delete Utility Companies](#bulk-delete-utility-companies)
- [Get Utility Companies by Category](#get-utility-companies-by-category)
- [Export Utility Companies](#export-utility-companies)
- [Upload Utility Companies CSV](#upload-utility-companies-csv)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/utility-company/create` | Create a new utility company |
| POST | `/api/v1/utility-company/update` | Update an existing utility company |
| GET | `/api/v1/utility-companies/all` | Get all utility companies |
| GET | `/api/v1/utility-company/:id` | Get a single utility company by ID |
| GET | `/api/v1/utility-company/email/:email` | Get utility company by email (for AI agent) |
| DELETE | `/api/v1/utility-companies/:id/delete` | Delete a utility company |
| POST | `/api/v1/utility-companies/bulk-delete` | Delete multiple utility companies |
| GET | `/api/v1/utility-companies/category/:category` | Get utility companies by category name |
| GET | `/api/v1/utility-companies/export` | Export utility companies to CSV |
| POST | `/api/v1/utility-companies/upload` | Upload utility companies from CSV |

---

## Create Utility Company

Create a new utility company in the system.

**Endpoint:** `POST /api/v1/utility-company/create`  
**Auth:** Admin only (Bearer Token or API Key)

### Request Body

```json
{
  "name": "GASAG AG",
  "email": "service@gasag.de",
  "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "description": "Gas provider for residential units"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Company name |
| email | string | Yes | Company email (unique) |
| categoryId | string | Yes | UUID of the category |
| description | string | Yes | Description |

### Response Example

```json
{
  "success": true,
  "company": {
    "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
    "name": "GASAG AG",
    "email": "service@gasag.de",
    "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "description": "Gas provider for residential units",
    "active": true,
    "createdAt": "2026-01-12T10:00:00.000Z",
    "updatedAt": "2026-01-12T10:00:00.000Z"
  }
}
```

---

## Update Utility Company

Update an existing utility company's information.

**Endpoint:** `POST /api/v1/utility-company/update`  
**Auth:** Admin only

### Request Body

```json
{
  "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
  "name": "GASAG Berlin",
  "categoryId": "new-category-uuid",
  "active": true
}
```

---

## Get All Utility Companies

Retrieve all utility companies with their category information.

**Endpoint:** `GET /api/v1/utility-companies/all`  
**Auth:** Admin only

---

## Get Single Utility Company

Retrieve a single utility company by ID.

**Endpoint:** `GET /api/v1/utility-company/:id`  
**Auth:** Admin only

---

## Get Utility Company by Email

Retrieve a utility company by their email address. Useful for AI agents/routing.

**Endpoint:** `GET /api/v1/utility-company/email/:email`  
**Auth:** API Key or User Session

---

## Delete Utility Company

Delete a single utility company by ID.

**Endpoint:** `DELETE /api/v1/utility-companies/:id/delete`  
**Auth:** Admin only

---

## Bulk Delete Utility Companies

Delete multiple utility companies at once.

**Endpoint:** `POST /api/v1/utility-companies/bulk-delete`  
**Auth:** Admin only

### Request Body

```json
{
  "ids": ["u1", "u2"]
}
```

---

## Get Utility Companies by Category

Retrieve all active utility companies in a specific category by name.

**Endpoint:** `GET /api/v1/utility-companies/category/:category`  
**Auth:** Session/API Key

---

## Export Utility Companies

Export all utility companies to a CSV file.

**Endpoint:** `GET /api/v1/utility-companies/export`  
**Auth:** Admin only

**Format:**
```csv
name,email,category,description
GASAG,service@gasag.de,Gas,Energy provider
```

---

## Upload Utility Companies CSV

Bulk import from a CSV file.

**Endpoint:** `POST /api/v1/utility-companies/upload`  
**Auth:** Admin only  
**Content-Type:** `multipart/form-data`

**CSV Format:**
```csv
name,email,category,description
GASAG,service@gasag.de,Gas,Energy provider
```
**Note:** `category` is the category NAME. If it doesn't exist, it will be auto-created.
