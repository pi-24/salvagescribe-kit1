// src/draft.js — draft generation (spec §5 "Draft generation")
//
// The model receives ONLY the resolved ledger JSON (never raw notes).
// It returns: { title, description_markdown, category_suggestion,
//   item_specifics, condition_disclosure, compatibility }
//
// Then src/guardrails.js post-processes the draft:
//   G1 strip working/functional/tested-OK unless tested===tested_ok
//   G2 confirmed_fitment only from compatibility_reference.csv when
//      part_number VERIFIED + matches; else the exact unverified sentence
//   G3 draft blocked if any damage row not VERIFIED
//   G4 no draft for excluded parts
//   G6 attach checklist_version + banner
//
// Noor's manual text edits are stored separately (POST /draft/edit) so a
// later ledger change regenerates the draft and re-applies her edits as
// a diff she can accept.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { callModel } from "./llm.js";
import { ledgerToJSON } from "./ledger.js";
import { applyGuardrails } from "./guardrails.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, "prompts", "draft.txt");

let _systemPrompt = null;
function systemPrompt() {
  if (!_systemPrompt) {
    _systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  }
  return _systemPrompt;
}

// JSON schema for the model's draft response
const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 80 },
    description_markdown: { type: "string" },
    category_suggestion: { type: "string" },
    item_specifics: {
      type: "object",
      properties: {
        make: { type: "string" },
        model: { type: "string" },
        year: { type: ["string", "number"] },
        side: { type: "string" },
        part_number: { type: ["string", "null"] },
        manufacturer: { type: "string" },
        features: { type: "string" },
        colour: { type: ["string", "null"] },
      },
    },
    condition_disclosure: {
      type: "object",
      properties: {
        cosmetic: { type: "string" },
        structural: { type: "string" },
        glass: { type: "string" },
        tested: { type: "string" },
      },
    },
    compatibility: {
      type: "object",
      properties: {
        donor_vehicle_recorded: { type: "string" },
        confirmed_fitment: { type: "array", items: { type: "object" } },
        unverified_statement: { type: ["string", "null"] },
      },
    },
  },
  required: [
    "title",
    "description_markdown",
    "category_suggestion",
    "item_specifics",
    "condition_disclosure",
    "compatibility",
  ],
  additionalProperties: false,
};

/**
 * Generate a draft for a part.
 * @param {object} ledger — the in-memory ledger object
 * @returns {Promise<object>} — { draft (guarded), raw_model_response, ledger_json }
 */
export async function generateDraft(ledger) {
  const partId = ledger.part_id;
  const ledgerJSON = ledgerToJSON(ledger);

  // Build the user prompt — ONLY resolved ledger values, never raw notes
  const userPrompt = [
    `Part ID: ${partId}`,
    "",
    "Resolved Evidence Ledger (values + statuses):",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(ledgerJSON.ledger).map(([attr, row]) => [
          attr,
          { value: row.value, status: row.status },
        ]),
      ),
      null,
      2,
    ),
    "",
    "Donor vehicle (from ledger):",
    `${ledgerJSON.ledger.donor_make?.value ?? "?"} ${ledgerJSON.ledger.donor_model?.value ?? "?"} ${ledgerJSON.ledger.donor_year?.value ?? "?"}`,
    "",
    "Photos available:",
    ...(ledgerJSON.photos ?? []).map((p) => `  - ${p.file}: ${p.shows}`),
  ].join("\n");

  const mockKey = `draft_${partId}`;

  // Call the model
  const rawDraft = await callModel({
    system: systemPrompt(),
    user: userPrompt,
    jsonSchema: DRAFT_SCHEMA,
    mockKey,
  });

  // Apply guardrails (G1-G6)
  const guarded = applyGuardrails(rawDraft, ledgerJSON);

  return {
    part_id: partId,
    blocked: guarded.blocked,
    guardrail: guarded.guardrail ?? null,
    reason: guarded.reason ?? null,
    blocking: guarded.blocking ?? null,
    draft: guarded.draft,
    raw_model_response: rawDraft,
    ledger_json: ledgerJSON,
  };
}

// ── Manual edit storage ────────────────────────────────────────────────────
// Noor's manual text edits are stored per-part.  When the draft is
// regenerated after a ledger change, her edits are diffed against the new
// draft and she can accept/reject each diff.

// In-memory store: partId → { title?, description_markdown?, timestamp }
const manualEdits = new Map();

export function storeManualEdit(partId, edits) {
  manualEdits.set(partId.toUpperCase(), {
    ...manualEdits.get(partId.toUpperCase()),
    ...edits,
    timestamp: new Date().toISOString(),
  });
  return manualEdits.get(partId.toUpperCase());
}

export function getManualEdits(partId) {
  return manualEdits.get(partId.toUpperCase()) ?? null;
}

/**
 * Apply manual edits to a guarded draft (if any exist for this part).
 * Returns { draft, edits_applied, conflicts }.
 * If the underlying ledger changed since the edit was made, the edited
 * text may conflict with new guardrail-stripped text — those are returned
 * as conflicts for Noor to review.
 */
export function applyManualEdits(partId, guardedDraft) {
  const edits = getManualEdits(partId);
  if (!edits || !guardedDraft) {
    return { draft: guardedDraft, edits_applied: null, conflicts: [] };
  }

  const conflicts = [];
  const draft = { ...guardedDraft };

  if (edits.title) {
    // Check if the edited title still passes G1 (no banned words if not tested_ok)
    // We don't re-run G1 here — just flag if the guardrail-stripped title
    // differs from what Noor edited against.
    if (draft.title !== edits.title) {
      conflicts.push({
        field: "title",
        guardrail_value: draft.title,
        noor_edit: edits.title,
      });
    }
    draft.title = edits.title;
  }

  if (edits.description_markdown) {
    if (draft.description_markdown !== edits.description_markdown) {
      conflicts.push({
        field: "description_markdown",
        guardrail_value: draft.description_markdown,
        noor_edit: edits.description_markdown,
      });
    }
    draft.description_markdown = edits.description_markdown;
  }

  return {
    draft,
    edits_applied: edits,
    conflicts,
  };
}
