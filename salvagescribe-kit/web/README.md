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

Guests can browse and search the supplied 20-part catalog, switch views and inspect source evidence. `/api/catalog` exposes only repository catalog sources. Private saved records, the SQLite snapshot, writes and messaging still require authentication.

The existing 20-part SQLite inventory was exported read-only to `data/existing_records.json`, retaining its evidence and corrections. The importer merges it with the repository CSV inventory and skips any part already saved to the signed-in account. New accounts can preview these existing sources, then choose **Import existing inventory** to save them to their own account. Saved Supabase records take precedence and are never replaced on page load. Account inventory API routes require authentication; the source catalog is public.

Photo manifests reference files that are not supplied as actual product images. The workspace shows their filenames and evidence descriptions; uploaded evidence with signed URLs is rendered as images. Prices come from the existing inventory. No currency conversion is assumed.

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
