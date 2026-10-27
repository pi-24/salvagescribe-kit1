# SalvageScribe

AI assistant that helps a Dubai salvage seller turn fragmented inventory info
(photos, spreadsheet rows, dismantling notes in English and Arabic) into
accurate, compatibility-aware used-parts listing drafts and a cross-border
readiness checklist — **without inventing part details, fitment, or condition
claims.**

Hackathon prototype. One corridor (UAE → UK), side-view mirrors only.

## Quick start

```bash
cp .env.example .env     # optional for P1; needed once LLM calls exist
npm install
npm start                # http://localhost:3000
```

## Stack

- Node 20 + Express backend
- Plain HTML/JS frontend served from `/public` (no build step)
- SQLite via `better-sqlite3` for state
- One command to run: `npm start`

## API (P1 subset)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/parts` | board view with readiness class per part |
| GET | `/api/parts/:id` | full ledger JSON |

## Project layout

```
src/
  ledger.js    Evidence Ledger data model (spec §1)
  loader.js    CSV/JSON -> initial ledgers, no model calls
  server.js    Express app
  llm.js       (P2) single LLM gateway — callModel()
  guardrails.js (P4) hard guardrails in code (spec §6)
data/          test pack: inventory, donors, notes, photos, reference, checklist
public/        frontend (P6)
```

See `PROJECT_SPEC.md` for the full design. Build sequence in `CODEBUDDY_PROMPTS.md`.
