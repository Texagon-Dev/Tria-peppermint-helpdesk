# Maintenance Status APIs

API endpoints for tracking and updating the maintenance status of tickets.

## Table of Contents

- [Endpoints Overview](#endpoints-overview)
- [Get All Maintenance Statuses](#get-all-maintenance-statuses)
- [Update Ticket Maintenance Status](#update-ticket-maintenance-status)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/maintenance-statuses` | Get all maintenance statuses with descriptions |
| PATCH | `/api/v1/ticket/:id/maintenance-status` | Update a ticket's maintenance status |

---

## Get All Maintenance Statuses

Retrieve all possible maintenance statuses, including their labels, descriptions, and valid transitions. Useful for UI dropdowns and AI context.

**Endpoint:** `GET /api/v1/maintenance-statuses`  
**Auth:** API Key or User Session (requires `issue::read` permission)

### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/maintenance-statuses \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response Example

```json
{
  "success": true,
  "statuses": [
    {
      "order": 1,
      "value": "pending",
      "label": "Pending",
      "description": "New maintenance request received, awaiting initial processing",
      "nextStatuses": ["quote_sent_to_vendor", "cancelled"]
    },
    {
      "order": 2,
      "value": "quote_sent_to_vendor",
      "label": "Quote Sent to Vendor",
      "description": "Quote request sent to vendor. Customer received acknowledgment. Waiting for vendor reply.",
      "nextStatuses": ["vendor_quote_received", "cancelled"]
    }
    // ... other statuses
  ]
}
```

---

## Update Ticket Maintenance Status

Update the maintenance status of a specific ticket. The transition must be valid according to the current status's `nextStatuses` list.

**Endpoint:** `PATCH /api/v1/ticket/:id/maintenance-status`  
**Auth:** API Key or User Session (requires `issue::update` permission)

### Request Body

```json
{
  "status": "quote_sent_to_vendor"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | The new maintenance status value (must be a valid transition) |

### cURL Example

```bash
curl -X PATCH http://localhost:3000/api/v1/ticket/abc-123-def/maintenance-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "quote_sent_to_vendor"
  }'
```

### Response Example

**Success (200):**
```json
{
  "success": true,
  "previousStatus": "pending",
  "currentStatus": "quote_sent_to_vendor",
  "statusInfo": {
    "order": 2,
    "value": "quote_sent_to_vendor",
    "label": "Quote Sent to Vendor",
    "description": "Quote request sent to vendor. Customer received acknowledgment. Waiting for vendor reply.",
    "nextStatuses": ["vendor_quote_received", "cancelled"]
  }
}
```

**Error - Invalid Status (400):**
```json
{
  "success": false,
  "error": "Invalid status: invalid_state. Valid statuses are: pending, quote_sent_to_vendor, ..."
}
```

**Error - Invalid Transition (400):**
```json
{
  "success": false,
  "error": "Invalid transition from 'pending' to 'work_completed'. Valid next statuses are: quote_sent_to_vendor, cancelled"
}
```
