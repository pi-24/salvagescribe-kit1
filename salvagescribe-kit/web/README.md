# SalvageScribe web app

The Next.js app uses the supplied Liquid Glass HTML and CSS as its primary inventory workspace. Account pages share the same theme.

From the repository root:

```sh
npm --prefix web install
npm --prefix web run dev
```

For production, run `npm --prefix web run build` followed by `npm --prefix web start`.

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in `web/.env.local`. Apply `web/supabase/platform.sql` to a new Supabase project. The currently configured project already exposes the platform tables.

Email confirmation is disabled in the connected Supabase project (`mailer_autoconfirm: true`). Signup uses email and password and immediately starts a session, without confirmation emails. For another project, turn off **Confirm email** under Authentication → Providers → Email; see [Supabase auth configuration](https://supabase.com/docs/guides/auth/general-configuration). `/api/auth/config` checks this setting before signup so an accidental configuration change cannot trigger confirmation mail or consume email quotas. The account form handles throttling without retries or resend requests and always offers guest browsing.

The marketplace uses the 10 exact listings from the latest supplied `LISTINGS_DATA`, stored without changes in `data/marketplace_listings.json`. Each listing retains its original ID, title, category, price, donor, part number, location, seller, photo count, display badges, and image URL. Thumbnails are cached individually as `public/marketglass/images/salvage-1.jpg` through `salvage-10.jpg`; `data/marketplace_images.json` records their source URLs. No listing borrows another item's thumbnail. Failed images use a neutral image-unavailable fallback.

Guests can browse, search, filter and inspect the catalog without signing in. Account writes and messages require authentication. **Import listings** saves the supplied catalog under account part IDs `SALVAGE-1` through `SALVAGE-10`; existing saved records are skipped. Previously saved inventory and the original SQLite snapshot remain intact. Catalog display badges are supplied metadata; technical approval still uses the actual evidence and readiness checks.

Corrections update the evidence ledger, draft and readiness together, with revision checks and an audit trail. Draft approval stays subject to the checklist. Messages and offers require another registered account and are persisted; voice recording and transcription are not configured.

Verification:

```sh
npm --prefix web test
npm --prefix web run build
cd web
npx playwright install chromium
npm run test:e2e
# Or use installed Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser tests exercise the real account page and route protection. Signup responses and signed-in inventory APIs are mocked to avoid creating accounts, sending email, or changing real account data.
