# Utility Category APIs

API endpoints for managing utility categories (e.g. Gas, Water, Insurance).

## Table of Contents

- [Endpoints Overview](#endpoints-overview)
- [Get All Categories](#get-all-categories)
- [Create Category](#create-category)
- [Delete Category](#delete-category)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/utility-categories` | Get all categories |
| POST | `/api/v1/utility-category/create` | Create a new category |
| DELETE | `/api/v1/utility-category/:id/delete` | Delete a category |

---

## Get All Categories

Retrieve all utility categories.

**Endpoint:** `GET /api/v1/utility-categories`  
**Auth:** Admin only

---

## Create Category

Create a new utility category.

**Endpoint:** `POST /api/v1/utility-category/create`  
**Auth:** Admin only

### Request Body

```json
{
  "name": "Gas"
}
```

---

## Delete Category

Delete a utility category. Cannot delete if companies are using it.

**Endpoint:** `DELETE /api/v1/utility-category/:id/delete`  
**Auth:** Admin only
