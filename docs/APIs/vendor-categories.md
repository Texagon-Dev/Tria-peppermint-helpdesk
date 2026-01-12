# Vendor Category APIs

API endpoints for managing vendor categories in the helpdesk system.

## Table of Contents

- [Endpoints Overview](#endpoints-overview)
- [Get All Categories](#get-all-categories)
- [Create Category](#create-category)
- [Delete Category](#delete-category)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/vendor-categories` | Get all categories |
| POST | `/api/v1/vendor-category/create` | Create a new category |
| DELETE | `/api/v1/vendor-category/:id/delete` | Delete a category |

---

## Get All Categories

Retrieve all vendor categories.

**Endpoint:** `GET /api/v1/vendor-categories`  
**Auth:** Admin only

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/vendor-categories \
  -H "Cookie: session=YOUR_SESSION_TOKEN"
```

### Response Example

```json
{
  "success": true,
  "categories": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Plumbing",
      "createdAt": "2026-01-12T09:00:00.000Z",
      "updatedAt": "2026-01-12T09:00:00.000Z"
    },
    {
      "id": "b2c3d4e5-f6g7-8901-bcde-f12345678901",
      "name": "Electrical",
      "createdAt": "2026-01-12T09:01:00.000Z",
      "updatedAt": "2026-01-12T09:01:00.000Z"
    },
    {
      "id": "c3d4e5f6-g7h8-9012-cdef-123456789012",
      "name": "HVAC",
      "createdAt": "2026-01-12T09:02:00.000Z",
      "updatedAt": "2026-01-12T09:02:00.000Z"
    }
  ]
}
```

---

## Create Category

Create a new vendor category.

**Endpoint:** `POST /api/v1/vendor-category/create`  
**Auth:** Admin only

### Request Body

```json
{
  "name": "Landscaping"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Category name (unique, will be trimmed) |

### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/vendor-category/create \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -d '{
    "name": "Landscaping"
  }'
```

### Response Example

**Success (200):**
```json
{
  "success": true,
  "category": {
    "id": "d4e5f6g7-h8i9-0123-defg-234567890123",
    "name": "Landscaping",
    "createdAt": "2026-01-12T10:00:00.000Z",
    "updatedAt": "2026-01-12T10:00:00.000Z"
  }
}
```

**Error - Missing Name (400):**
```json
{
  "success": false,
  "error": "Category name is required"
}
```

**Error - Duplicate Name (400):**
```json
{
  "success": false,
  "error": "A category with this name already exists"
}
```

---

## Delete Category

Delete a vendor category. Cannot delete if vendors are using the category.

**Endpoint:** `DELETE /api/v1/vendor-category/:id/delete`  
**Auth:** Admin only

### cURL Example

```bash
curl -X DELETE http://localhost:3000/api/v1/vendor-category/d4e5f6g7-h8i9-0123-defg-234567890123/delete \
  -H "Cookie: session=YOUR_SESSION_TOKEN"
```

### Response Example

**Success (200):**
```json
{
  "success": true
}
```

**Error - Category In Use (400):**
```json
{
  "success": false,
  "error": "Cannot delete category because it is in use by one or more vendors."
}
```

**Error - Not Found (404):**
```json
{
  "success": false,
  "error": "Category not found"
}
```
