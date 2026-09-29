# FoodLens API

Base URL: `http://localhost:8000`

Send `Authorization: Bearer <token>` on every route except register, login, and the health checks. The React Native app stores that token. Do not put `MONGODB_URI` or `AI_API_KEY` in the app.

Errors use this shape. Field errors are keyed by the form field so the app can highlight them.

```json
{
  "message": "Enter a valid email",
  "code": "VALIDATION_ERROR",
  "errors": { "email": "Enter a valid email" },
  "requestId": "..."
}
```

## Auth

### `POST /api/auth/register`

```json
{ "name": "Ada", "email": "ada@example.com", "password": "at least 8 characters" }
```

`201`

```json
{
  "token": "<jwt>",
  "user": { "id": "...", "name": "Ada", "email": "ada@example.com" }
}
```

`409` if the email is already registered. Passwords are hashed with bcrypt and are never returned.

### `POST /api/auth/login`

```json
{ "email": "ada@example.com", "password": "..." }
```

`200` with the same session shape. `401` uses one message for an unknown email and a wrong password.

### `GET /api/users/me`

`200` with `{ "id", "name", "email" }`.

## Profiles

A user can keep more than one profile. The first profile is primary. Creating or updating with `isPrimary: true` clears the flag on the others. Deleting the primary profile promotes the most recently updated remaining profile.

### `GET /api/profiles`

`200` with an array.

### `POST /api/profiles`

### `PUT /api/profiles/:id`

```json
{
  "name": "Aria",
  "role": "child",
  "ageGroup": "child",
  "age": 6,
  "diet": "none",
  "dietaryPreferences": ["Gluten-free"],
  "allergies": ["Milk", "Peanuts"],
  "limits": ["Added sugar", "Sodium"],
  "notes": null,
  "isPrimary": true
}
```

`role`: `self`, `adult`, `child`, `baby`, `other`

`ageGroup`: `baby`, `child`, `teen`, `adult`, `older_adult`, or `null`

`diet`: `none`, `vegetarian`, `vegan`

`age` is an integer from 0 to 120, or `null`.

`201` on create, `200` on update, with the saved profile including `id`. `404` when the profile is not owned by the caller.

### `DELETE /api/profiles/:id`

`204` with an empty body.

## Products

### `GET /api/products/:barcode`

Looks up a stored product by barcode or id. This does not run profile analysis and does not flag ingredients.

```json
{
  "id": "8901234567890",
  "name": "Masala chips",
  "brand": "Example Foods",
  "barcode": "8901234567890",
  "ingredientsText": "Potato, sunflower oil, salt",
  "ingredients": [{ "id": "ingredient-0", "name": "Potato", "flagged": false }],
  "nutrition": [{ "id": "sodium", "name": "Sodium", "amount": "800", "unit": "mg", "note": "per 100 g" }],
  "countryCodes": ["IN"],
  "source": "open_food_facts",
  "sourceUpdatedAt": "2023-11-14T22:13:20.000Z"
}
```

`source` is `open_food_facts` or `label_ocr`.

## Scans

### `POST /api/scans/barcode`

```json
{ "barcode": "8901234567890", "profileId": "...", "country": "IN" }
```

`country` is optional. Accepted values include `IN`, `India`, `US`, `USA`, `GB`, `UK`, and `CA`.

The server reads Open Food Facts, stores the product, and refreshes it after `PRODUCT_CACHE_TTL_HOURS`. If the upstream service is down and a previous copy exists, the scan says the copy could not be refreshed and the status is at least `review`.

`201` with an analysis object. `404` when the barcode is unknown.

### `POST /api/scans/label`

`multipart/form-data` with:

- `profileId`
- `image` (JPEG, PNG, or WebP, 8 MB max)
- `country` (optional)

The image is checked by file signature, sent to the vision model, and discarded. It is not written to disk or MongoDB. The vision prompt only asks for ingredient and nutrition text.

`503` when `AI_API_KEY` is empty. `422` when the ingredient list cannot be read. A label scan is never `suitable`, because photo reading can miss an allergen.

### `GET /api/scans/history`

`200` with an array of the latest 100 analyses for the signed-in user, newest first.

### `GET /api/scans/:id`

`200` with one analysis. `404` when it belongs to someone else or does not exist.

## Analysis object

```json
{
  "id": "scan id",
  "createdAt": "2026-09-29T08:00:00.000Z",
  "scanType": "barcode",
  "profileId": "...",
  "profileName": "Aria",
  "status": "review",
  "statusLabel": "Review the findings",
  "summary": "For Aria, review Masala chips before using it for this profile. ... This is not a medical diagnosis, and it is not a guarantee about ingredients or allergens that were not in the available data. Check the physical package label.",
  "disclaimer": "FoodLens does not diagnose medical conditions...",
  "product": { "id": "8901234567890", "name": "Masala chips", "brand": "Example Foods", "ingredients": [], "nutrition": [] },
  "findings": [],
  "concerns": [],
  "allergens": [
    {
      "id": "ALLERGEN:milk:may_contain",
      "type": "ALLERGEN",
      "title": "Milk listed as may contain",
      "ingredient": "milk",
      "ingredientName": "milk",
      "severity": "MEDIUM",
      "reason": "This profile lists a milk allergy. The source says it may contain milk. That is a cross-contact warning, not a confirmed ingredient.",
      "explanation": "...",
      "detection": "may_contain",
      "evidence": "May contain milk — Open Food Facts lists milk as a possible trace, not as a confirmed ingredient.",
      "evidenceItems": [
        {
          "id": "ALLERGEN:milk:may_contain-0",
          "title": "May contain milk",
          "detail": "Open Food Facts lists milk as a possible trace, not as a confirmed ingredient.",
          "source": "Open Food Facts trace tag"
        }
      ]
    }
  ],
  "nutritionConcerns": [],
  "relevantIngredients": [],
  "ingredients": [{ "id": "ingredient-0", "name": "salt", "flagged": false }],
  "nutrition": [],
  "evidence": [],
  "countryPacks": [{ "code": "IN", "name": "India", "authority": "FSSAI" }],
  "limitations": ["Screening uses only the ingredient text, allergen declarations, and nutrition numbers stored for this product."]
}
```

`status` is `suitable`, `review`, or `avoid`.

`severity` on a finding is `HIGH`, `MEDIUM`, `LOW`, or `INFO`. A high allergen match makes the overall status `avoid`. A may-contain or inferred match makes it `review`.

Sections:

| Field | What it contains |
| --- | --- |
| `allergens` | Profile allergy matches |
| `nutritionConcerns` | Added sugar, sodium, saturated fat, caffeine, artificial sweeteners |
| `relevantIngredients` | Diet, gluten-free, nut-free, halal, kosher, organic, custom limits |
| `concerns` | Age guidance and missing or stale data |
| `findings` | All of the above, in one list |

`detection` is `detected`, `may_contain`, `inferred`, `nutrition_label`, or `missing_data`.

The summary is the rules text. When an AI key is set, a rewrite is used only if it still names every high-severity ingredient, includes “not a medical diagnosis,” and does not claim the product is safe. Otherwise the rules text is returned.

## Country rules

Packs are data in `src/rules/countries.ts`.

| Code | Authority | What it changes |
| --- | --- | --- |
| `US` | FDA | Priority allergens, coconut counted as a tree nut, per-serving 20% Daily Value screen |
| `GB` | UK FSA | 14 allergen groups, per-100 g traffic-light high cut-offs |
| `CA` | Health Canada | Priority allergens, per-serving 15% Daily Value screen. Coconut is not a tree nut |
| `IN` | FSSAI | Allergen list used for evidence. Numeric screens fall back to the international per-100 g thresholds |
| `INTL` | Screening baseline | Used only when no pack matches. Country rules are described as not applied |

A profile allergy is still matched from the ingredient list when that allergen is not regulated in the product's country. The evidence says which list was used.
