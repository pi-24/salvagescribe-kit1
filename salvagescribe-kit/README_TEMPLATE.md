# <TeamName>-SalvageScribe

> Repository name must include your team name (hackathon rule). Keep the repo **Public**.

AI assistant that turns a salvage yard's fragmented inventory information
(photos, spreadsheet rows, Arabic/English notes, donor-vehicle records) into
evidence-tracked used-parts listing drafts and a UAE→UK readiness checklist —
without inventing part numbers, fitment or condition.

Built for the FutureMindz Fest Hackathon (Dubai CommerCity) — eBay case study
"From Salvage Yard to Global Marketplace". Developed with Tencent CodeBuddy on
Tencent Cloud.

## What it does
- **Evidence ledger** per part: every attribute carries a source and a status
  (VERIFIED / PARTIAL / CONFLICTING / MISSING / UNVERIFIABLE).
- **Targeted questions** (English + Arabic) only for what the evidence can't settle.
- **Listing drafts** with mandatory condition disclosure and compatibility
  split into *donor vehicle recorded* / *confirmed fitment* / *unverified*.
- **Readiness checklist** (versioned test checklist, rule IDs) classifying each
  part as Ready for seller review / Information missing / Specialist review.
- Correct once, propagate everywhere: a seller confirmation updates ledger,
  draft and checklist together.

## Prerequisites
- Node.js 20+
- npm 10+
- (Optional) an LLM API key — the app runs fully in `MOCK=1` mode without one.

## Install
```bash
git clone https://github.com/<you>/<TeamName>-SalvageScribe.git
cd <TeamName>-SalvageScribe
npm install
```

## Configure
```bash
cp .env.example .env
```
| Variable | Purpose | Example |
|---|---|---|
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `https://...` |
| `LLM_API_KEY` | API key | `sk-...` |
| `LLM_MODEL` | Model name pinned for demo | `...` |
| `MOCK` | `1` = canned responses, no credits used | `1` |
| `PORT` | HTTP port | `3000` |

## Build and run
```bash
npm run seed      # load the 10-part demo inventory
npm start         # http://localhost:3000
```
```bash
npm test          # guardrail unit tests
npm run eval      # run all 20 test-pack parts against data/answer_key.json
```

## Test data
All data in `data/` is synthetic. Part numbers are invented. No real seller,
buyer or production credentials are used. `data/answer_key.json` is for judges.

## Demo
- Video: <link>
- Normal journey: MIR-001. Hard case: MIR-004 (conflicting year, partial label,
  possible mounting-tab damage, untested). Refusal case: free-text "say it fits
  all Corollas".

## Trust boundary / limitations
The prototype does not certify authenticity, guarantee compatibility, infer
functionality from photos, or provide customs/legal clearance. The checklist is
a labelled test checklist. Listing approval stays with the seller. No live
publication or shipment booking.

## Requirements for a real pilot
Approved compatibility dataset; dated, reviewed corridor checklist; seller data
handling agreement; model cost ceiling per part; human review workflow.

## Team
<names, roles>
