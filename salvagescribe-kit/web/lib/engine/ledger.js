// src/ledger.js — Evidence Ledger data model (PROJECT_SPEC §1)
//
// Each part has a ledger: one row per attribute.  The listing draft, open
// questions and the readiness result are all computed FROM the ledger.
// Noor never edits a draft field directly; she corrects the ledger row, and
// the correction propagates everywhere.

// ── Statuses ────────────────────────────────────────────────────────────────

export const STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  PARTIAL: "PARTIAL",
  CONFLICTING: "CONFLICTING",
  MISSING: "MISSING",
  UNVERIFIABLE: "UNVERIFIABLE",
});

// ── Source ranking (spec §1) ────────────────────────────────────────────────
// seller_confirmed > photo_label > dismantling_note > spreadsheet >
// model_inference.  Used to pre-fill, NEVER to silently override.

export const SOURCE_RANK = Object.freeze({
  seller_confirmed: 5,
  photo_label: 4,
  photo: 3, // photo (non-label) — ranked just below label
  dismantling_note: 2,
  spreadsheet: 1,
  model_inference: 0,
});

// model_inference can only ever produce PARTIAL or UNVERIFIABLE, never VERIFIED.
export const INFERENCE_SOURCES = new Set(["model_inference"]);

// ── Required attributes for a side-view mirror (spec §2) ───────────────────

export const REQUIRED_ATTRS = Object.freeze([
  "part_type",
  "side",
  "manufacturer",
  "part_number",
  "donor_make",
  "donor_model",
  "donor_year",
  "features",
  "cosmetic_condition",
  "structural_damage",
  "glass_condition",
  "tested",
  "included_components",
  "packaged_dimensions_cm",
  "packaged_weight_kg",
]);

export const OPTIONAL_ATTRS = Object.freeze([
  "colour",
  "paint_code",
  "storage_location",
  "asking_price",
]);

export function requiredAttrs() {
  return [...REQUIRED_ATTRS];
}

// ── Ledger factory ──────────────────────────────────────────────────────────

export function createLedger(partId) {
  return {
    part_id: partId,
    classification: null, // set by readiness engine later
    exclusion_flag: false,
    notes: { en: null, ar: null },
    photos: [],
    spreadsheet_row: null,
    ledger: Object.fromEntries([...REQUIRED_ATTRS, ...OPTIONAL_ATTRS].map((attr) => [attr, {
      value: null, candidates: [], status: STATUS.MISSING, question_id: `Q-${partId}-${attr}`,
    }])),
    // ordered for stable serialisation
    _attr_order: [...REQUIRED_ATTRS, ...OPTIONAL_ATTRS],
  };
}

// ── setCandidate(attr, value, source, sourceRef) ───────────────────────────
// Adds a candidate value for an attribute.  Multiple candidates are kept
// until resolve() applies the ranking / conflict rules.

export function setCandidate(ledger, attr, value, source, sourceRef) {
  if (!ledger.ledger[attr]) {
    ledger.ledger[attr] = {
      value: null,
      candidates: [],
      status: STATUS.MISSING,
      question_id: `Q-${ledger.part_id}-${attr}`,
    };
  }

  const row = ledger.ledger[attr];

  // model_inference can never upgrade a row to VERIFIED.  We still store the
  // candidate but resolve() will cap the status at PARTIAL.
  const duplicate = source !== "seller_confirmed" && row.candidates.some((c) =>
    JSON.stringify(c.value) === JSON.stringify(value) && c.source === source && c.source_ref === sourceRef);
  if (!duplicate) row.candidates.push({ value, source, source_ref: sourceRef });

  return ledger;
}

// ── resolve(attr) ──────────────────────────────────────────────────────────
// Applies ranking rules to a single attribute row and sets .value + .status.
//
// Rules (spec §1):
//   - seller_confirmed value → VERIFIED (highest rank, trusted).
//   - A fully-readable photo_label value → VERIFIED.
//   - Two different values from non-seller sources → CONFLICTING.
//   - A value containing '?' (unreadable chars) → PARTIAL.
//   - No candidates → MISSING.
//   - model_inference source → at most PARTIAL (never VERIFIED).

export function resolve(ledger, attr) {
  const row = ledger.ledger[attr];
  if (!row) {
    return { value: null, status: STATUS.MISSING };
  }

  const candidates = row.candidates;

  if (candidates.length === 0) {
    row.value = null;
    row.status = STATUS.MISSING;
    return { value: row.value, status: row.status };
  }

  // Sort candidates by source rank descending (highest trust first).
  const sorted = [...candidates].sort(
    (a, b) => (SOURCE_RANK[b.source] ?? 0) - (SOURCE_RANK[a.source] ?? 0),
  );

  // --- seller_confirmed → VERIFIED ---
  const seller = candidates.findLast((c) => c.source === "seller_confirmed");
  if (seller) {
    row.value = seller.value;
    row.status = STATUS.VERIFIED;
    return { value: row.value, status: row.status };
  }

  // --- fully-readable photo_label → VERIFIED ---
  // A value with '?' chars indicates an unreadable label, so PARTIAL, not
  // VERIFIED.  Only a fully-readable (no '?') label photo qualifies.
  const label = candidates.find(
    (c) => c.source === "photo_label" && !String(c.value).includes("?"),
  );
  if (label) {
    row.value = label.value;
    row.status = STATUS.VERIFIED;
    return { value: row.value, status: row.status };
  }

  // --- conflict detection: two different values from non-seller sources ---
  const nonSeller = candidates.filter((c) => c.source !== "seller_confirmed");
  const distinctValues = new Set(
    nonSeller.map((c) => normaliseValue(c.value)),
  );
  if (distinctValues.size > 1) {
    row.value = null;
    row.status = STATUS.CONFLICTING;
    return { value: row.value, status: row.status };
  }

  // --- single distinct value from non-seller sources ---
  // Take the highest-ranked candidate.
  const best = sorted[0];

  // If value contains '?' → PARTIAL (partially legible).
  if (String(best.value).includes("?")) {
    row.value = best.value;
    row.status = STATUS.PARTIAL;
    return { value: row.value, status: row.status };
  }

  // model_inference → at most PARTIAL.
  if (INFERENCE_SOURCES.has(best.source)) {
    row.value = best.value;
    row.status = STATUS.PARTIAL;
    return { value: row.value, status: row.status };
  }

  // Any other non-seller, non-label source with a clean value → PARTIAL.
  // (spreadsheet, dismantling_note, photo — none of these are "trusted" enough
  //  for VERIFIED on their own; only seller_confirmed or a full label photo
  //  can produce VERIFIED per the design rule.)
  row.value = best.value;
  row.status = STATUS.PARTIAL;
  return { value: row.value, status: row.status };
}

// ── confirm(attr, value) — seller_confirmed => VERIFIED ─────────────────────
// Only seller_confirmed or a fully-readable label photo may set VERIFIED.
// confirm() simulates Noor pressing the Confirm button on a question.

export function confirm(ledger, attr, value) {
  setCandidate(ledger, attr, value, "seller_confirmed", "seller_confirmed");
  return resolve(ledger, attr);
}

// ── helpers ────────────────────────────────────────────────────────────────

function normaliseValue(v) {
  if (v === null || v === undefined) return "";
  // Normalise years to numbers for comparison; strings compared lowercased.
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && /^\d{4}$/.test(String(v).trim())) {
    return asNum;
  }
  return String(v).trim().toLowerCase();
}

// Resolve all attributes at once (useful after bulk candidate insertion).
export function resolveAll(ledger) {
  for (const attr of Object.keys(ledger.ledger)) {
    resolve(ledger, attr);
  }
  return ledger;
}

// Serialise ledger to a plain JSON-safe object (ordered attribute list).
export function ledgerToJSON(ledger) {
  const orderedLedger = {};
  for (const attr of ledger._attr_order ?? [...REQUIRED_ATTRS, ...OPTIONAL_ATTRS]) {
    if (ledger.ledger[attr]) {
      orderedLedger[attr] = ledger.ledger[attr];
    }
  }
  // include any attrs not in the canonical order (future-proof)
  for (const attr of Object.keys(ledger.ledger)) {
    if (!orderedLedger[attr]) {
      orderedLedger[attr] = ledger.ledger[attr];
    }
  }
  return {
    part_id: ledger.part_id,
    classification: ledger.classification,
    exclusion_flag: ledger.exclusion_flag,
    notes: ledger.notes,
    photos: ledger.photos,
    spreadsheet_row: ledger.spreadsheet_row,
    possible_damage: ledger.possible_damage ?? [],
    ingested: ledger.ingested ?? false,
    ledger: structuredClone(orderedLedger),
  };
}
