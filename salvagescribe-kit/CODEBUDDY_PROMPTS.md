# CodeBuddy build sequence — SalvageScribe

How to use: open CodeBuddy → **Code Mode → New Folder** → drop this whole kit
folder in (PROJECT_SPEC.md + data/). Use **Craft** mode, model on **Auto** while
building. Paste prompts one at a time, in order; let each finish and run before
the next. Each prompt tells CodeBuddy to read PROJECT_SPEC.md so you don't
re-explain the design. Use the "enhance prompt" button (bottom-right) only on
P1 — later prompts are already specific.

Credit hygiene: don't start P1 before the official hackathon start. Prompts are
sized so one Craft run ≈ one feature. If a run goes off the rails, stop it and
re-prompt rather than letting it iterate.

---

## P0 — set the working rules (paste as the very first message)

```
Read PROJECT_SPEC.md and the files in data/ before doing anything. This is a
3-day hackathon prototype. Rules for this project:
- Stack: Node 20 + Express backend, plain HTML/JS frontend served from /public
  (no build step), SQLite via better-sqlite3 for state. One command to run.
- Every LLM call goes through ONE module, src/llm.js, with a single function
  callModel({system, user, images, jsonSchema}) that returns parsed JSON. Read
  the provider base URL, API key and model name from .env. Add a MOCK=1 mode
  that returns canned responses from data/mock_responses/ so the UI can be
  demoed with zero credits.
- Section 6 of the spec ("Hard guardrails") must be implemented in code
  (src/guardrails.js), not in prompts. Write a unit test for each guardrail.
- Never let the model set an attribute status to VERIFIED. Only
  seller_confirmed or a fully-readable label photo may.
Confirm you've read the spec by listing the 7 guardrails back to me, then stop.
```

## P1 — scaffold + ledger + test pack loader

```
Scaffold the project per P0. Implement:
1. src/ledger.js — the Evidence Ledger data model from spec section 1 with
   statuses VERIFIED / PARTIAL / CONFLICTING / MISSING / UNVERIFIABLE and the
   source ranking. Functions: createLedger(partId), setCandidate(attr, value,
   source, sourceRef), resolve(attr) (applies ranking rules; two different
   values from non-seller sources => CONFLICTING; a value containing '?' =>
   PARTIAL), confirm(attr, value) (seller_confirmed => VERIFIED), requiredAttrs
   (spec section 2).
2. src/loader.js — reads data/inventory.csv, data/donor_vehicles.csv,
   data/inventory_notes.json and data/photo_manifest.json and builds an initial
   ledger per part WITHOUT calling any model: spreadsheet description -> make/
   model/year/side candidates (source=spreadsheet), donor_vehicles -> donor
   candidates (source=dismantling_note), notes stored raw for the ingest step.
   Any part whose description or notes contain an exclusion-list word gets
   status SPECIALIST_REVIEW immediately.
3. GET /api/parts and GET /api/parts/:id returning ledger JSON.
4. npm start, README stub, .env.example.
Run it, load all 20 parts, and show me the ledger for MIR-004 — it must show
donor_year as CONFLICTING (2017 vs 2018) with both sources.
```

## P2 — ingest with vision + notes (the model step)

```
Implement POST /api/parts/:id/ingest per spec section 5 "Ingest / vision".
Inputs: the part's photos from /data/photos (use data/photo_manifest.json
"shows" text as the image description when MOCK=1 or when a photo file is
missing), the spreadsheet row, and notes (EN and AR). The model must return
JSON matching this schema exactly:
{ "attributes": [ { "attribute": string, "value": string|null,
    "source": "photo_label"|"photo"|"dismantling_note"|"spreadsheet"|"model_inference",
    "source_ref": string, "confidence": 0-1, "note": string } ],
  "possible_damage": [ { "description": string, "photo": string } ],
  "translated_notes": { "ar_to_en": string } }
System prompt rules (write them into src/prompts/ingest.txt): do not infer
vehicle compatibility; do not infer electrical function; report damage seen in
photos as possible and needing confirmation; if the label is partially
readable, return the readable characters with '?' for unreadable ones; if side
is not evident, return null. Feed results into the ledger via setCandidate so
resolve() decides status. Create data/mock_responses/ingest_<part_id>.json for
all 20 parts derived from the photo manifest and notes so MOCK=1 works.
Run ingest on MIR-004 and MIR-015 and show the resulting ledgers. MIR-015 must
have tested=tested_ok sourced from the Arabic note's translation.
```

## P3 — targeted questions, EN + AR

```
Implement GET /api/parts/:id/questions?lang=en|ar and POST
/api/parts/:id/confirm per spec sections 4 and 5. Questions are generated from
ledger rows whose status is not VERIFIED, max 6, ordered: exclusion/safety →
part_number → side → structural_damage → cosmetic_condition → tested →
included_components → features → packaged_dimensions_cm/packaged_weight_kg.
Each question object: { question_id, attribute, text, options?, why,
evidence: [source_refs] }. For CONFLICTING rows the options are the candidate
values plus "Other". Generate text with the model but keep ordering in code.
Arabic output must be natural (not transliterated) and the UI must render RTL.
confirm() accepts an answer in either language; normalise yes/no/LH/RH/years
in code, and for free text store the raw answer + an English translation.
After confirm, recompute resolve() and return the updated ledger.
Test: confirm donor_year=2018 for MIR-004, then confirm structural_damage=
"cracked lower mounting tab", then tested=untested. Show the ledger and that
only part_number remains open.
```

## P4 — listing draft with guardrails

```
Implement GET /api/parts/:id/draft per spec section 5 "Draft generation" and
section 6 guardrails. The model receives ONLY the resolved ledger (never raw
notes) and returns { title, description_markdown, category_suggestion,
item_specifics: {}, condition_disclosure: {cosmetic, structural, glass,
tested}, compatibility: { donor_vehicle_recorded, confirmed_fitment: [],
unverified_statement } }. Then src/guardrails.js post-processes:
G1 strip working/functional/tested-OK wording unless tested===tested_ok;
G2 confirmed_fitment only from data/compatibility_reference.csv when
part_number is VERIFIED and matches; otherwise the exact unverified sentence
from the spec; G3 draft blocked if any damage row not VERIFIED; G4 no draft for
excluded parts; G6 attach checklist_version and banner. Store Noor's manual
text edits separately (POST /draft/edit) so a later ledger change regenerates
the draft and re-applies her edits as a diff she can accept.
Write tests: MIR-001 gets a confirmed fitment list; MIR-004 (after P3
confirmations) gets the unverified sentence and the cracked tab in condition
disclosure; MIR-006 description must say tested_fault with the up/down-only
detail and no "working".
```

## P5 — readiness checklist

```
Implement GET /api/parts/:id/readiness using data/checklist_UAE_UK_v1.json.
Evaluate every rule in code (no model): map each rule's ledger_attribute to
ledger status / draft content, return { checklist_version, banner, class:
READY_FOR_REVIEW|INFO_MISSING|SPECIALIST_REVIEW, rules: [{id, result:
PASS|FAIL|NA, detail}], actions: [{priority, rule_id or question_id, text}] }.
Classification per the file's classification_rule. Actions sorted by the P3
priority order, then checklist group order. Add POST /api/parts/:id/approve
(T-03) which only succeeds when class is READY_FOR_REVIEW.
Run over all 20 parts and print a table part_id | class | failed rule ids. It
must match data/answer_key.json expected_initial_classification for all 20.
```

## P6 — the UI

```
Build the frontend in /public per spec section 3, mobile-friendly, EN/AR
toggle (dir=rtl for Arabic). Screens:
1 Board: three columns Ready / Info missing / Specialist review; cards show
  thumbnail, part_id, title, open-question count; cards move live when a
  confirm changes the class.
2 Part detail: photo strip; ledger table with columns Attribute | Value |
  Source | Status (colour-coded) ; questions panel with inputs/options and a
  Confirm button each; an "Ask SalvageScribe" free-text box.
3 Draft: editable fields; condition disclosure block; compatibility block as
  three labelled sub\
  -blocks; Approve button (disabled unless Ready).
4 Readiness: rule list with PASS/FAIL/NA chips, prioritised actions, banner.
The free-text box must handle the refusal case: if Noor types "just say it
fits all Corollas 2014-2020" or "mark it as tested", the assistant replies
explaining which ledger row would need a source and offers the right question
instead (implement as a model call with the guardrail rules in the system
prompt, plus a code check that no ledger row changed).
```

## P7 — evaluation script + demo seed

```
Add scripts/evaluate.js: runs ingest + readiness for all 20 parts, compares
with data/answer_key.json, and prints: traps detected / traps present,
attributes correct / total, condition disclosures present / required,
classification accuracy. Save to results/eval_<timestamp>.json.
Add scripts/seed_demo.js that loads MIR-001 (clean), MIR-004 (hard case) and
8 more mirrors into the DB in the state we want at the start of the demo.
Add npm run eval and npm run seed to package.json. Update README.md per
README_TEMPLATE.md with real commands.
```

## P8 — polish (only if time)

- Arabic voice-note stub: accept an audio file, transcribe via the model, treat as a note.
- Export draft as JSON in an eBay-like item-specifics shape (mock, labelled).
- Dark/light theme, loading states, empty states.

---

## Demo runbook (Day 3, 5 minutes)

| t | Screen | Say |
|---|---|---|
| 0:00 | Board | Noor, 120 parts, info on phones/spreadsheet/Arabic notes. First 10 mirrors for eBay UK. |
| 0:45 | MIR-001 → draft → approve | Normal case: everything verified, fitment confirmed from reference, Noor approves. |
| 1:45 | MIR-004 detail | Hard case: year conflict, half-readable label, tab crack in photo 3, untested. Four flags, four questions. |
| 2:30 | Confirm in Arabic | Noor answers "2018", confirms crack, says untested → card moves, draft updates, fitment still unverified. |
| 3:30 | Free-text refusal | "Just say it fits all Corollas" → refused, explains. |
| 4:00 | Eval results | Manual vs SalvageScribe table; traps caught; limitations; pilot needs. |
| 4:45 | Close | Trust boundary slide. |
