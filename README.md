# SalvageScribe

SalvageScribe is a salvage-parts marketplace and listing workspace for the UAE → UK trade corridor. It combines a Liquid Glass interface with source evidence, seller corrections, listing drafts and an internal readiness checklist.

## Quick start

Requires Node.js 20+ and npm.

```sh
npm install
npm --prefix web install
npm run dev
```

Open [localhost:3000](http://localhost:3000). Guests can browse the catalog without an account.

For production:

```sh
npm run build
npm start
```

The primary application is the Next.js app in `web/`. The original Express prototype is available with `npm run start:legacy`.

## Configuration

Create `web/.env.local` with your project's public Supabase credentials:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported. Public browsing works without Supabase; account features require it. Never put a Supabase service-role key in a public environment variable.

For a new Supabase project, run `web/supabase/platform.sql` in its SQL Editor to create the account records, evidence, revision history, messaging tables and access policies.

Under **Authentication → Providers → Email**, disable **Confirm email**. Signup uses email and password and starts a session immediately. The connected project already has email confirmation disabled. The app checks this setting before signup and does not request confirmation or resend emails. Rate-limit errors keep guest browsing available.

Optional AI settings:

```dotenv
LLM_BASE_URL=https://api.z.ai/api/paas/v4
LLM_API_KEY=your-key
LLM_MODEL=glm-5
# MOCK=1
```

Without a live AI key, deterministic listing templates remain available. The older demo fixtures apply only to their original part IDs; the new catalog requires seller input or a configured AI service for additional evidence extraction.

## Catalog and thumbnails

The marketplace uses the latest supplied `LISTINGS_DATA`: **10 listings**, each with its own title, price, category, donor vehicle, part number, location, seller details and thumbnail.

| File | Purpose |
| --- | --- |
| `web/data/marketplace_listings.json` | Exact supplied listing data, including original `imageUrl` values |
| `web/data/marketplace_images.json` | Image source URLs and cached-file metadata |
| `web/public/marketglass/images/salvage-1.jpg` through `salvage-10.jpg` | Each listing's cached thumbnail |
| `web/lib/marketplace-catalog.js` | Converts catalog entries into workspace records |
| `web/public/marketglass/app.js` | Displays listings, filtering, item details and conversations |

Images are matched by listing ID rather than list position. Each item keeps its own thumbnail when sorted, searched, filtered or opened in the workspace. Grid view, list view, item details and conversation context use the same mapping. An unavailable image gets a neutral fallback rather than another item's photograph.

To update a listing, edit its entry in `marketplace_listings.json` and replace its matching cached image. When changing `imageUrl`, refresh the cached image and its entry in `marketplace_images.json` too. Listing thumbnails are presentation artwork; they are kept separate from source photo evidence.

## Guest and account features

Guests can browse, search and filter all supplied listings, switch between grid and list layouts, and inspect the workspace. Saving corrections, creating parts, drafting listings and messaging require an account.

After signing in, choose **Import listings** to save the supplied catalog to your account. Original listing IDs such as `salvage-1` are stored as part IDs such as `SALVAGE-1`. Import skips records already in your account. Previous inventory, the original CSV files and the SQLite snapshot are preserved; old demo records do not replace the new marketplace catalog.

Corrections update the evidence ledger, drafts and readiness together. Concurrent changes are checked using record revisions. Draft approval requires the actual evidence checklist; a catalog display badge does not grant approval. Listings remain drafts until the seller reviews them, and the app does not publish them to eBay.

Conversations and offers are saved between registered accounts. Voice recording, transcription, escrow and live eBay integration are not configured.

## Verification

```sh
npm test
npm run build
cd web
npx playwright install chromium
npm run test:e2e
```

If Google Chrome is already installed:

```sh
cd web
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser checks cover guest access, protected account actions, signup without email confirmation, rate-limit handling, saved corrections, mobile layout, image loading, fallback behavior and each listing's exact title/price/thumbnail pairing. Account responses are mocked during browser tests so they do not modify real accounts.

See [web/README.md](web/README.md) for web-specific notes and [PROJECT_SPEC.md](PROJECT_SPEC.md) for the original prototype specification.
