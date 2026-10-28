// src/guardrails.js — Hard guardrails (spec §6) implemented IN CODE, not prompts.
//
// These functions post-process a draft produced by the model.  The model
// generates the draft text; guardrails enforce the inviolable rules:
//
//   G1  tested != tested_ok → description cannot contain "working",
//       "functional", or "tested OK".
//   G2  confirmed_fitment only from compatibility_reference.csv when
//       part_number is VERIFIED and matches; otherwise the exact
//       unverified sentence from the spec.
//   G3  draft blocked if any damage row (structural_damage, cosmetic_condition)
//       is not VERIFIED.
//   G4  no draft for excluded parts (SPECIALIST_REVIEW).
//   G6  attach checklist_version and banner to every draft.
//
// G5 (refuse unsupported seller shortcuts) and G7 (human approval gate) are
// enforced at the API layer, not in the draft post-processing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = join(process.cwd(), "lib", "engine");
const DATA_DIR = join(__dirname, "..", "..", "data");

// ── Load compatibility reference and checklist once ────────────────────────

let _compatRows = null;
function compatRows() {
  if (!_compatRows) {
    _compatRows = parseCSV(
      readFileSync(join(DATA_DIR, "compatibility_reference.csv"), "utf8"),
    ).rows;
  }
  return _compatRows;
}

let _checklist = null;
function checklist() {
  if (!_checklist) {
    _checklist = JSON.parse(
      readFileSync(join(DATA_DIR, "checklist_UAE_UK_v1.json"), "utf8"),
    );
  }
  return _checklist;
}

// Minimal CSV parser (copied from loader to keep guardrails dependency-free)
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells[i] ?? "";
    return obj;
  });
  return { headers, rows };
}
function splitLine(line) {
  const cells = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

// ── G1: strip working/functional/tested-OK wording ─────────────────────────
// If tested !== "tested_ok", remove the words "working", "functional",
// "tested OK" (case-insensitive) from the description and title.
// Returns { applied: boolean, stripped: string[], text: string }.

export function g1_stripFunctionalClaims(draft, ledgerJSON) {
  const testedRow = ledgerJSON.ledger.tested;
  const testedValue = testedRow?.value;

  if (testedValue === "tested_ok") {
    return { applied: false, stripped: [], title: draft.title, description: draft.description_markdown };
  }

  const BANNED = /\b(working|functional|tested\s*ok|works\s*(?:fine|perfectly)?)\b/gi;
  const stripped = [];

  let title = draft.title ?? "";
  let desc = draft.description_markdown ?? "";

  // Collect what we're removing for audit
  const titleMatches = title.match(BANNED) ?? [];
  const descMatches = desc.match(BANNED) ?? [];
  stripped.push(...titleMatches, ...descMatches);

  title = title.replace(BANNED, "");
  desc = desc.replace(BANNED, "");

  // Clean up double spaces left behind
  title = title.replace(/\s{2,}/g, " ").trim();
  desc = desc.replace(/\s{2,}/g, " ").trim();

  return {
    applied: stripped.length > 0,
    stripped,
    title,
    description: desc,
  };
}

// ── G2: compatibility fitment gating ───────────────────────────────────────
// If part_number is VERIFIED and matches a row in compatibility_reference.csv,
// return that row as confirmed_fitment. Otherwise return the exact unverified
// sentence from the spec.

export function g2_fitmentGate(ledgerJSON) {
  const pnRow = ledgerJSON.ledger.part_number;
  const pnValue = pnRow?.value;
  const pnStatus = pnRow?.status;

  // Donor vehicle recorded
  const make = ledgerJSON.ledger.donor_make?.value ?? "(unknown)";
  const model = ledgerJSON.ledger.donor_model?.value ?? "(unknown)";
  const year = ledgerJSON.ledger.donor_year?.value ?? "(unknown)";
  const donorVehicle = `${make} ${model} ${year}`;

  // Check if part_number is VERIFIED and matches the reference
  if (pnStatus === "VERIFIED" && pnValue) {
    const match = compatRows().find(
      (r) => r.part_number.toUpperCase() === String(pnValue).toUpperCase(),
    );
    if (match) {
      return {
        donor_vehicle_recorded: donorVehicle,
        confirmed_fitment: [
          {
            make: match.make,
            model: match.model,
            years: match.years,
            side: match.side,
            features: match.features,
            source_type: match.source_type,
            part_number: match.part_number,
          },
        ],
        unverified_statement: null,
        matched: true,
      };
    }
  }

  // Not verified or no match → unverified sentence
  const unverifiedStatement =
    `Fitment: unverified. Donor vehicle recorded as ${donorVehicle}. ` +
    `Confirm by part number before purchase.`;

  return {
    donor_vehicle_recorded: donorVehicle,
    confirmed_fitment: [],
    unverified_statement: unverifiedStatement,
    matched: false,
  };
}

// ── G3: block draft if damage rows not VERIFIED ────────────────────────────

export function g3_damageBlock(ledgerJSON) {
  const damageAttrs = ["structural_damage", "cosmetic_condition"];
  const blocking = [];

  for (const attr of damageAttrs) {
    const row = ledgerJSON.ledger[attr];
    if (row && row.status !== "VERIFIED") {
      blocking.push({
        attribute: attr,
        status: row.status,
        value: row.value,
        question_id: row.question_id,
      });
    }
  }

  return {
    blocked: blocking.length > 0,
    blocking,
  };
}

// ── G4: no draft for excluded parts ─────────────────────────────────────────

export function g4_exclusionCheck(ledgerJSON) {
  if (ledgerJSON.exclusion_flag || ledgerJSON.classification === "SPECIALIST_REVIEW") {
    return {
      blocked: true,
      reason: "Part is on the exclusion list — routed to SPECIALIST_REVIEW. No draft generated.",
    };
  }
  return { blocked: false, reason: null };
}

// ── G6: checklist version + banner ──────────────────────────────────────────

export function g6_checklistMeta() {
  const cl = checklist();
  return {
    checklist_id: cl.checklist_id,
    checklist_version: cl.checklist_version,
    banner: cl.banner,
  };
}

// ── applyGuardrails(draft, ledgerJSON) ──────────────────────────────────────
// Runs all guardrails in sequence and returns the final draft (or a block).
// If G4 blocks (exclusion), returns { blocked: true, reason }.
// If G3 blocks (unverified damage), returns { blocked: true, reason, blocking }.
// Otherwise applies G1, G2, G6 and returns the cleaned draft.

export function applyGuardrails(draft, ledgerJSON) {
  // G4 — exclusion
  const g4 = g4_exclusionCheck(ledgerJSON);
  if (g4.blocked) {
    return {
      blocked: true,
      guardrail: "G4",
      reason: g4.reason,
      draft: null,
    };
  }

  // G3 — unverified damage
  const g3 = g3_damageBlock(ledgerJSON);
  if (g3.blocked) {
    return {
      blocked: true,
      guardrail: "G3",
      reason: "Draft blocked: damage attribute(s) not VERIFIED. Confirm damage before generating draft.",
      blocking: g3.blocking,
      draft: null,
    };
  }

  // G1 — strip functional claims
  const g1 = g1_stripFunctionalClaims(draft, ledgerJSON);

  // G2 — fitment gate
  const g2 = g2_fitmentGate(ledgerJSON);

  // G6 — checklist meta
  const g6 = g6_checklistMeta();

  // Build the final guarded draft
  const guardedDraft = {
    title: g1.title,
    description_markdown: g1.description,
    category_suggestion: draft.category_suggestion ?? null,
    item_specifics: draft.item_specifics ?? {},
    condition_disclosure: {
      cosmetic: ledgerJSON.ledger.cosmetic_condition?.value ?? null,
      structural: ledgerJSON.ledger.structural_damage?.value ?? null,
      glass: ledgerJSON.ledger.glass_condition?.value ?? null,
      tested: ledgerJSON.ledger.tested?.value ?? null,
    },
    compatibility: {
      donor_vehicle_recorded: g2.donor_vehicle_recorded,
      confirmed_fitment: g2.confirmed_fitment,
      unverified_statement: g2.unverified_statement,
    },
    guardrails_applied: {
      g1_stripped: g1.stripped,
      g2_matched: g2.matched,
      g3_blocked: false,
      g4_blocked: false,
    },
    checklist: g6,
  };

  return {
    blocked: false,
    guardrail: null,
    draft: guardedDraft,
  };
}
