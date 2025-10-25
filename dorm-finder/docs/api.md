# Dorm Finder API — Contract (v1)

**Base URL (local dev):** `http://localhost:4000`  
**Prefix:** `/api`  
**Version:** v1 (breaking changes require a new prefix, e.g. `/api/v2`)

**Content-Type:** `application/json` for all requests and responses  
**Errors:** JSON `{ "error": "message" }` with a correct HTTP status code

---

## Objects

### Dorm
```json
{
  "_id": "66b7c7c9f1abc1234567890",
  "name": "Green House Dorm",
  "type": "dorm",                          // enum: dorm | apartment | condo
  "location": {
    "type": "Point",
    "coordinates": [100.5234, 13.7368]     // [lng, lat]
  },
  "price": { "min": 3500, "max": 5200, "currency": "THB" },
  "amenities": ["wifi", "aircon", "laundry"],
  "createdAt": "2025-08-10T10:00:00.000Z",
  "updatedAt": "2025-08-10T10:00:00.000Z"
}
