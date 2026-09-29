# FoodLens API

REST API for the FoodLens food scanner. The Expo app talks to this server through `EXPO_PUBLIC_API_URL`. MongoDB credentials and AI keys stay here and are never shipped in the mobile app.

Barcode and label scans follow one path:

```
image or barcode
  -> ingredient text
  -> ingredient normalization
  -> product and nutrition data
  -> deterministic rules
  -> profile match
  -> optional plain-language explanation
  -> API response
```

A model may read a label photo and may rewrite the explanation. It does not decide whether a food is medically safe. Status (`suitable`, `review`, or `avoid`) comes only from the rules engine.

## Requirements

- Node.js 20 or newer
- MongoDB 6 or newer, local or Atlas

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

The API listens on port **8000** so the Expo app can use:

```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Use your computer's LAN address instead of `localhost` for a physical phone. The server binds to `0.0.0.0`.

Set `MONGODB_URI` and `JWT_SECRET` in `.env` only. Leave `AI_API_KEY` empty until you want label photos. Barcode lookup works without an AI key.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start with reload |
| `npm test` | Rules, ingredient, and mapping tests |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |

## Safety

- Findings name the ingredient, the profile setting, and the evidence.
- `detected` means the ingredient or an allergen declaration listed it.
- `may_contain` is a trace warning, not a confirmed ingredient, and stays at review.
- `inferred` means the wording is ambiguous, such as `flour` without a grain.
- A result is not `suitable` when the ingredient list is missing, the product cache is stale, or the text came from a photo.
- Copy never says a product is medically safe or certifies halal, kosher, vegan, gluten-free, or organic status.
- Country packs for India (FSSAI), the United States (FDA), the United Kingdom (FSA), and Canada (Health Canada) live in `src/rules/countries.ts`. Unknown countries use an international screening baseline and say that country rules were not applied.
- Optional `country` on a scan is an ISO code or country name. It is not assumed.

## Layout

```
src/
  config/        environment, logger, MongoDB
  controllers/   HTTP only
  middleware/    auth, validation, uploads, errors
  models/        User, Profile, Product, Scan
  routes/
  services/      auth, profiles, products, scans, analysis
  ai/            vision and explanation, behind a guard
  rules/         dictionaries, country packs, rules engine
  utils/
  types/
  app.ts
  server.ts
```

MongoDB indexes are declared on the schemas and created when the API connects:

- `users.email` unique
- `profiles` by user and creation time, and by user and primary flag
- `products.barcode` unique and sparse
- `scans` by user and creation time, and by user, profile, and creation time

## API

See [docs/API.md](docs/API.md).

`GET /health` and `GET /ready` do not require a token.
