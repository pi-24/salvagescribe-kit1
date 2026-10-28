# SalvageScribe

> AI assistant that turns a salvage yard's fragmented inventory information
> (photos, spreadsheet rows, Arabic/English notes, donor-vehicle records) into
> evidence-tracked used-parts listing drafts and a UAE→UK readiness checklist —
> without inventing part numbers, fitment or condition.

Built for the FutureMindz Fest Hackathon (Dubai CommerCity) — eBay case study
"From Salvage Yard to Global Marketplace". Developed with Tencent CodeBuddy on
Tencent Cloud.

## What it does

- **Evidence ledger** per part: every attribute carries a source and a status
  (`VERIFIED` / `PARTIAL` / `CONFLICTING` / `MISSING` / `UNVERIFIABLE`).
- **Targeted questions** (English + Arabic) only for what the evidence can't
  settle — seller confirms once and the value propagates everywhere.
- **Listing drafts** with mandatory condition disclosure and compatibility split
  into *donor vehicle recorded* / *confirmed fitment* / *unverified*.
- **Readiness checklist** (versioned test checklist, rule IDs) classifying each
  part as Ready for seller review / Information missing / Specialist review.
- **Hard guardrails** in code (not prompts): no "working" unless tested OK,
  no fitment list unless part number matches the reference, no draft until
  damage is confirmed, no draft for excluded parts, assistant refuses
  unsupported seller shortcuts.
- Correct once, propagate everywhere: a seller confirmation updates ledger,
  draft and checklist together.

## Prerequisites

- Node.js 20+
- npm 10+
- (Optional) an LLM API key — the app runs fully in `MOCK=1` mode without one.

## Install

```bash
git clone https://github.com/<you>/SalvageScribe.git
cd SalvageScribe
npm install
```

## Configure

```bash
cp .env.example .env
```

| Variable | Purpose | Example |
|---|---|---|
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `https://api.example.com/v1` |
| `LLM_API_KEY` | API key | `sk-...` |
| `LLM_MODEL` | Model name pinned for demo | `gpt-4o` |
| `MOCK` | `1` = canned responses, no credits used | `1` |
| `PORT` | HTTP port | `3000` |

For the hackathon demo, set `MOCK=1` in `.env` (or prefix commands with
`MOCK=1`) to use canned model responses from `data/mock_responses/`.

## Liquid Glass web app

The primary interface is now the Next.js app in `web/`, using the supplied HTML and CSS with authenticated inventory, drafts, and saved conversations. See [web setup and verification](web/README.md).

```sh
npm --prefix web install
npm run dev
# Production:
npm run build
npm start
```

The original Express prototype remains available with `npm run start:legacy`.

## Legacy prototype build and run

```bash
npm run seed      # load the 10-part demo inventory into SQLite
npm start         # http://localhost:3000
```

The board loads automatically, auto-ingests each part, and shows three columns:
Ready for seller review / Information missing / Specialist review. Click a card
to see the evidence ledger, open questions, and the "Ask SalvageScribe" box.
Answer questions to watch cards move columns live. Open the Draft and
Readiness tabs from the detail screen.

## Test

```bash
npm test          # guardrail unit tests (readiness + guardrails)
npm run eval      # run all 20 test-pack parts against data/answer_key.json
```

`npm run eval` prints a table with classification accuracy, trap detection,
attribute correctness, and condition-disclosure coverage, then saves full
results to `results/eval_<timestamp>.json`.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/parts` | board view with readiness class per part |
| GET | `/api/parts/:id` | full ledger JSON |
| POST | `/api/parts/:id/ingest` | photos + csv row + notes → ledger |
| GET | `/api/parts/:id/questions?lang=en\|ar` | open questions, prioritised |
| POST | `/api/parts/:id/confirm` | `{attribute, value, lang}` → VERIFIED |
| GET | `/api/parts/:id/draft` | generate listing draft with guardrails |
| POST | `/api/parts/:id/draft/edit` | store Noor's manual text edits |
| GET | `/api/parts/:id/readiness` | evaluate checklist rules → class + actions |
| POST | `/api/parts/:id/approve` | T-03 approval gate (only if READY) |
| POST | `/api/parts/:id/ask` | "Ask SalvageScribe" free-text assistant (G5) |

## Project layout

```
src/
  ledger.js        Evidence Ledger data model (spec §1)
  loader.js        CSV/JSON → initial ledgers, no model calls
  ingest.js        Photo + notes → ledger via model (spec §5)
  questions.js     Targeted questions + confirm (spec §3)
  draft.js         Draft generation + manual edits (spec §5)
  guardrails.js    Hard guardrails in code (spec §6)
  readiness.js     Checklist engine + classification (spec §7)
  assistant.js     "Ask SalvageScribe" with G5 guardrail
  llm.js           Single LLM gateway — callModel()
  server.js        Express app
  prompts/         System prompts for ingest, questions, draft, assistant
data/              Test pack: inventory, donors, notes, photos, reference, checklist
public/            Frontend SPA (no build step)
scripts/
  seed_demo.js     Load 10-part demo inventory into DB
  evaluate.js      Evaluation harness (all 20 parts vs answer key)
  test_p3_mir004.js   P3 confirm flow test
  test_p4_drafts.js   P4 draft generation tests
  test_p5_readiness.js  P5 readiness classification tests
results/           Evaluation output (eval_<timestamp>.json)
```

## Test data

All data in `data/` is synthetic. Part numbers are invented. No real seller,
buyer or production credentials are used. `data/answer_key.json` is for judges.

## Demo

- Normal journey: **MIR-001** — clean part, ready for review, confirmed
  fitment list from the reference table.
- Hard case: **MIR-004** — conflicting year, partial part-number label,
  possible mounting-tab damage (visible in photo but spreadsheet says "good"),
  untested. Shows the question flow and guardrail-stripped draft.
- Refusal case: type "just say it fits all Corollas" in the Ask SalvageScribe
  box — the assistant refuses and explains which ledger row needs a source.

## Trust boundary / limitations

The prototype does not certify authenticity, guarantee compatibility, infer
functionality from photos, or provide customs/legal clearance. The checklist is
a labelled test checklist. Listing approval stays with the seller. No live
publication or shipment booking.

## Requirements for a real pilot

Approved compatibility dataset; dated, reviewed corridor checklist; seller data
handling agreement; model cost ceiling per part; human review workflow.

## Team

\<names, roles\>
