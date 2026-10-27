# SalvageScribe — Project Spec

AI assistant that helps Noor (Dubai salvage seller) turn fragmented inventory
info into accurate, compatibility-aware used-parts listing drafts and a
cross-border readiness checklist — **without inventing part details, fitment,
or condition claims.**

Scope (per brief): 10 side-view mirrors in the live demo, 20 records in the
test pack, one corridor (UAE → UK), one versioned test checklist. Airbags,
batteries and other hazardous/safety parts are rejected at intake.

---

## 1. The one design rule: everything derives from the Evidence Ledger

Each part has a ledger — one row per attribute. The listing draft, the open
questions and the readiness result are all computed *from* the ledger. Noor
never edits a draft field directly; she corrects the ledger row, and the
correction propagates everywhere.

```json
{
  "part_id": "MIR-004",
  "ledger": {
    "donor_year": {
      "value": null,
      "candidates": [
        {"value": 2017, "source": "spreadsheet", "source_ref": "inventory.csv row 4"},
        {"value": 2018, "source": "dismantling_note", "source_ref": "notes.json MIR-004"}
      ],
      "status": "CONFLICTING",
      "question_id": "Q-MIR-004-donor_year"
    },
    "part_number": {
      "value": "87910-02F??",
      "source": "photo",
      "source_ref": "MIR-004_label.jpg",
      "status": "PARTIAL",
      "question_id": "Q-MIR-004-part_number"
    },
    "tested": {
      "value": null,
      "source": null,
      "status": "MISSING"
    }
  }
}
```

### Attribute statuses
| Status | Meaning | Effect on draft |
|---|---|---|
| `VERIFIED` | Single value, trusted source or Noor-confirmed | Stated as fact |
| `PARTIAL` | Value present but incomplete/unreadable | Stated as "partially legible", question raised |
| `CONFLICTING` | Two sources disagree | Not stated; question raised |
| `MISSING` | No source | Not stated; question raised |
| `UNVERIFIABLE` | Can't be resolved by Noor (e.g. fitment with no part number) | Draft says "unverified" explicitly |

### Source ranking (used to pre-fill, never to silently override)
`seller_confirmed` > `photo_label` > `dismantling_note` > `spreadsheet` > `model_inference`

`model_inference` (e.g. "looks like a Corolla mirror") can only ever produce
`PARTIAL` or `UNVERIFIABLE`, never `VERIFIED`.

---

## 2. Required attributes for a side-view mirror

| Attribute | Required for "Ready" | Typical sources |
|---|---|---|
| part_type | yes | spreadsheet, photo |
| side (LH/RH) | yes | note, photo, Noor |
| manufacturer (OEM/aftermarket) | yes | label photo |
| part_number | yes, or explicit "not available" | label photo |
| donor_make / donor_model / donor_year | yes (single, non-conflicting) | spreadsheet, dismantling note |
| colour / paint code | no | photo, note |
| features (heated, folding, signal, camera, blind-spot) | yes | note, photo (connector count), Noor |
| cosmetic_condition (scratches, cracks) | yes | photos, Noor |
| structural_damage (mounting tab, housing) | yes | photos, Noor |
| glass_condition | yes | photos |
| tested (electrical) | yes: `tested_ok` / `tested_fault` / `untested` | note, Noor |
| included_components (cover, glass, harness) | yes | note, Noor |
| packaged_dimensions_cm (L×W×H) | yes for shipping | Noor |
| packaged_weight_kg | yes for shipping | Noor |
| storage_location | no | spreadsheet |
| asking_price | no | spreadsheet |

---

## 3. Journey & screens

1. **Inventory board** (home) — three columns:
   *Ready for seller review* / *Information missing* / *Specialist review required*.
   Each card: thumbnail, part_id, short title, count of open questions.
2. **Part detail** — photos strip; ledger table (attribute, value, source, status);
   open questions panel (EN/AR toggle); "Confirm" inputs per question.
3. **Listing draft** — editable title, description, suggested category,
   item specifics; *Condition disclosure* block; *Compatibility* block split into
   "Donor vehicle (recorded)" vs "Confirmed fitment (from reference)" vs "Unverified".
4. **Readiness** — checklist rules with pass/fail/n.a., rule IDs, prioritised action list.
5. **Intake** — upload photos + CSV row + notes; or pick from the test pack.

Language: UI strings and generated questions available in English and Arabic
(RTL). Noor's answers accepted in either language.

---

## 4. Backend API (JSON)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/parts/ingest` | photos + csv row + notes → ledger (calls vision/text model, returns structured JSON) |
| GET | `/api/parts` | board view with readiness class per part |
| GET | `/api/parts/:id` | ledger, questions, draft, readiness |
| GET | `/api/parts/:id/questions?lang=en\|ar` | open questions, prioritised |
| POST | `/api/parts/:id/confirm` | `{attribute, value, lang}` → updates ledger row to VERIFIED (source=`seller_confirmed`), recomputes draft + readiness |
| GET | `/api/parts/:id/draft` | listing draft derived from ledger |
| POST | `/api/parts/:id/draft/edit` | Noor's manual text edits (stored separately, never overwrite ledger) |
| GET | `/api/parts/:id/readiness` | checklist evaluation + actions |
| POST | `/api/parts/:id/approve` | marks seller-approved (human approval gate) |

State: SQLite (or a JSON file per part). No cloud DB — conserve credits.

---

## 5. Model calls (one per stage, strict JSON output)

- **Ingest / vision:** given photos + spreadsheet row + notes, return ledger
  rows with `source` and `status`. Prompt forbids inferring fitment or
  functionality; damage seen in photos is reported as "possible damage, confirm".
- **Question generation:** given ledger, return ≤6 prioritised questions, each
  tied to one attribute, in requested language. Priority order:
  safety/exclusion → identifiers → side → damage → tested → components → shipping dims.
- **Draft generation:** given ledger only (never raw notes), return title (≤80
  chars), description, category suggestion, item specifics. Template enforces
  the three compatibility blocks and the condition disclosure block.
- **Translation:** Arabic ↔ English for notes and answers.

Pin one model for the demo so outputs are reproducible; use "Auto" while building.

---

## 6. Hard guardrails (code, not prompts)

1. `tested != tested_ok` → description cannot contain "working", "functional", "tested OK".
2. Compatibility list appears only if `part_number` is `VERIFIED` **and** matches
   `compatibility_reference.csv`. Otherwise block reads:
   *"Fitment: unverified. Donor vehicle recorded as {make model year}. Confirm by part number before purchase."*
3. Any `structural_damage` or `cosmetic_condition` row with status ≠ VERIFIED
   blocks "Ready" and forces the question.
4. Exclusion list (`airbag`, `battery`, `seatbelt pretensioner`, `fuel tank`,
   `brake component`) → readiness = `SPECIALIST_REVIEW`, no draft generated.
5. Requests from the user to "just say it fits X" or "mark as tested" without
   evidence → assistant refuses and explains which ledger row would need a source.
6. Checklist output always carries `checklist_version` and the banner
   *"Test checklist — not legal, customs or compliance clearance."*
7. Final approval is a button only Noor presses; nothing is "published".

---

## 7. Readiness classification

```
if part_type in EXCLUSION_LIST or safety_flag:            SPECIALIST_REVIEW
elif any required attribute status in {MISSING, CONFLICTING, PARTIAL}: INFO_MISSING
elif any checklist rule == FAIL:                           INFO_MISSING
else:                                                      READY_FOR_REVIEW
```
Action list = failed rules + open questions, sorted by the priority order above.

---

## 8. Measurement (for the results slide)

Run the same 10 parts through (a) manual workflow by one teammate, (b) SalvageScribe.
Record per part:

| Metric | Manual | SalvageScribe |
|---|---|---|
| Prep time (min) | | |
| Attributes correctly populated / total (vs answer key) | | |
| Traps detected / traps present | | |
| Condition disclosures present / required | | |
| Corrections needed before approval | | |

---

## 9. Out of scope (say so on the slide)

Live eBay publication, shipment booking, real customs assessment, authenticity
certification, production integrations, real seller data.
