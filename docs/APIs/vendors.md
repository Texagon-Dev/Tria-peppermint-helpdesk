# Vendor APIs

API endpoints for managing vendors in the helpdesk system.

## Table of Contents

- [Endpoints Overview](#endpoints-overview)
- [Create Vendor](#create-vendor)
- [Update Vendor](#update-vendor)
- [Get All Vendors](#get-all-vendors)
- [Get Single Vendor](#get-single-vendor)
- [Delete Vendor](#delete-vendor)
- [Bulk Delete Vendors](#bulk-delete-vendors)
- [Get Vendors by Category](#get-vendors-by-category)
- [Upload Vendors CSV](#upload-vendors-csv)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/vendor/create` | Create a new vendor |
| POST | `/api/v1/vendor/update` | Update an existing vendor |
| GET | `/api/v1/vendors/all` | Get all vendors |
| GET | `/api/v1/vendor/:id` | Get a single vendor by ID |
| DELETE | `/api/v1/vendors/:id/delete` | Delete a vendor |
| POST | `/api/v1/vendors/bulk-delete` | Delete multiple vendors |
| GET | `/api/v1/vendors/category/:category` | Get vendors by category name |
| GET | `/api/v1/vendors/export` | Export vendors to CSV |
| POST | `/api/v1/vendors/upload` | Upload vendors from CSV |

---

## Create Vendor

Create a new vendor in the system.

**Endpoint:** `POST /api/v1/vendor/create`  
**Auth:** Admin only (Session or API Key)

### Request Body

```json
{
  "name": "ABC Plumbing Co.",
  "email": "contact@abcplumbing.com",
  "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "description": "Professional plumbing services"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Vendor name |
| email | string | Yes | Vendor email (unique) |
| categoryId | string | Yes | UUID of the category |
| description | string | Yes | Vendor description |

### cURL Example

```bash
# Using Session Token
curl -X POST http://localhost:3000/api/v1/vendor/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{ ... }'

# OR Using API Key
curl -X POST http://localhost:3000/api/v1/vendor/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{ ... }'
```



### Response Example

```json
{
  "success": true,
  "vendor": {
    "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
    "name": "ABC Plumbing Co.",
    "email": "contact@abcplumbing.com",
    "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "description": "Professional plumbing services",
    "active": true,
    "createdAt": "2026-01-12T10:00:00.000Z",
    "updatedAt": "2026-01-12T10:00:00.000Z"
  }
}
```

---

## Update Vendor

Update an existing vendor's information.

**Endpoint:** `POST /api/v1/vendor/update`  
**Auth:** Admin only (Session or API Key)

### Request Body

```json
{
  "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
  "name": "ABC Plumbing & Heating",
  "categoryId": "new-category-uuid",
  "active": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Vendor UUID |
| name | string | No | Updated name |
| email | string | No | Updated email |
| categoryId | string | No | Updated category UUID |
| description | string | No | Updated description |
| active | boolean | No | Active status |

### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/vendor/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
    "name": "ABC Plumbing & Heating",
    "active": true
  }'
```

### Response Example

```json
{
  "success": true,
  "vendor": {
    "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
    "name": "ABC Plumbing & Heating",
    "email": "contact@abcplumbing.com",
    "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "description": "Professional plumbing services",
    "active": true,
    "createdAt": "2026-01-12T10:00:00.000Z",
    "updatedAt": "2026-01-12T10:05:00.000Z"
  }
}
```

---

## Get All Vendors

Retrieve all vendors with their category information.

**Endpoint:** `GET /api/v1/vendors/all`  
**Auth:** Admin only

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/vendors/all \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response Example

```json
{
  "success": true,
  "vendors": [
    {
      "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
      "name": "ABC Plumbing Co.",
      "email": "contact@abcplumbing.com",
      "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "description": "Professional plumbing services",
      "active": true,
      "createdAt": "2026-01-12T10:00:00.000Z",
      "updatedAt": "2026-01-12T10:00:00.000Z",
      "category": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Plumbing",
        "createdAt": "2026-01-12T09:00:00.000Z",
        "updatedAt": "2026-01-12T09:00:00.000Z"
      }
    }
  ]
}
```

---

## Get Single Vendor

Retrieve a single vendor by ID.

**Endpoint:** `GET /api/v1/vendor/:id`  
**Auth:** Admin only

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/vendor/v1w2x3y4-z5a6-7890-vend-or1234567890 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response Example

```json
{
  "success": true,
  "vendor": {
    "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
    "name": "ABC Plumbing Co.",
    "email": "contact@abcplumbing.com",
    "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "description": "Professional plumbing services",
    "active": true,
    "createdAt": "2026-01-12T10:00:00.000Z",
    "updatedAt": "2026-01-12T10:00:00.000Z",
    "category": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Plumbing",
      "createdAt": "2026-01-12T09:00:00.000Z",
      "updatedAt": "2026-01-12T09:00:00.000Z"
    }
  }
}
```

---

## Delete Vendor

Delete a single vendor by ID.

**Endpoint:** `DELETE /api/v1/vendors/:id/delete`  
**Auth:** Admin only

### cURL Example

```bash
curl -X DELETE http://localhost:3000/api/v1/vendors/v1w2x3y4-z5a6-7890-vend-or1234567890/delete \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response Example

```json
{
  "success": true
}
```

---

## Bulk Delete Vendors

Delete multiple vendors at once.

**Endpoint:** `POST /api/v1/vendors/bulk-delete`  
**Auth:** Admin only (Session or API Key)

### Request Body

```json
{
  "ids": [
    "vendor-uuid-1",
    "vendor-uuid-2",
    "vendor-uuid-3"
  ]
}
```

### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/vendors/bulk-delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "ids": ["vendor-uuid-1", "vendor-uuid-2"]
  }'
```

### Response Example

```json
{
  "success": true,
  "count": 2
}
```

---

## Get Vendors by Category

Retrieve all active vendors in a specific category by name.

**Endpoint:** `GET /api/v1/vendors/category/:category`  
**Auth:** None (public for AI agent)

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/vendors/category/Plumbing
```

### Response Example

```json
{
  "success": true,
  "vendors": [
    {
      "id": "v1w2x3y4-z5a6-7890-vend-or1234567890",
      "name": "ABC Plumbing Co.",
      "email": "contact@abcplumbing.com",
      "categoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "description": "Professional plumbing services",
      "active": true,
      "createdAt": "2026-01-12T10:00:00.000Z",
      "updatedAt": "2026-01-12T10:00:00.000Z",
      "category": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Plumbing",
        "createdAt": "2026-01-12T09:00:00.000Z",
        "updatedAt": "2026-01-12T09:00:00.000Z"
      }
    }
  ]
}
```

---

## Export Vendors

Export all vendors to a CSV file. The category field will contain the category name.

**Endpoint:** `GET /api/v1/vendors/export`  
**Auth:** Admin only

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/vendors/export \
  -H "Authorization: Bearer YOUR_TOKEN" > vendors.csv
```

### Response

Returns a CSV file with the following headers:
`name,email,category,description`

---

## Upload Vendors CSV

Bulk import vendors from a CSV file.

**Endpoint:** `POST /api/v1/vendors/upload`  
**Auth:** Admin only  
**Content-Type:** `multipart/form-data`

### CSV Format

```csv
name,email,category,description
ABC Plumbing,contact@abc.com,Plumbing,Professional services
XYZ Electric,info@xyz.com,Electrical,24/7 electrician
```

**Note:** The `category` column should contain the category name (e.g., "Plumbing"). If the category does not exist, it will be automatically created.

### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/vendors/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@vendors.csv"
```

### Response Example

```json
{
  "success": true,
  "message": "Processed 50 records. Created/Ignored Duplicates: 48. Errors: 2",
  "errors": [
    { "email": "bad@email", "error": "Missing required fields" }
  ]
}
```
