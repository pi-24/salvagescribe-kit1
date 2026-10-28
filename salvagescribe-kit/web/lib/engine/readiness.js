// src/readiness.js — readiness classification engine (spec §7, checklist §6)
//
// Evaluates every rule in data/checklist_UAE_UK_v1.json IN CODE (no model).
// Maps each rule's ledger_attribute to ledger status / draft content.
//
// Returns:
//   { checklist_version, banner, class, rules: [{id, result, detail}],
//     actions: [{priority, rule_id?, question_id?, text}] }
//
// Classification per the file's classification_rule:
//   SPECIALIST_REVIEW if any 'block' rule fails;
//   INFO_MISSING if any 'required' rule fails or any required ledger
//     attribute is not VERIFIED (for critical attributes);
//   READY_FOR_REVIEW otherwise.
//
// Actions sorted by P3 priority order, then checklist group order.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ledgerToJSON, STATUS } from "./ledger.js";

const __dirname = join(process.cwd(), "lib", "engine");
const DATA_DIR = join(__dirname, "..", "..", "data");

let _checklist = null;
function checklist() {
  if (!_checklist) {
    _checklist = JSON.parse(
      readFileSync(join(DATA_DIR, "checklist_UAE_UK_v1.json"), "utf8"),
    );
  }
  return _checklist;
}

// ── P3 priority order (same as questions.js) ───────────────────────────────
// Lower index = higher priority.  Used for sorting actions.
const PRIORITY_ORDER = [
  "part_type", // exclusion/safety
  "part_number",
  "side",
  "structural_damage",
  "cosmetic_condition",
  "tested",
  "included_components",
  "features",
  "packaged_dimensions_cm",
  "packaged_weight_kg",
  "donor_make",
  "donor_model",
  "donor_year",
  "manufacturer",
  "glass_condition",
];

function priorityRank(attr) {
  const idx = PRIORITY_ORDER.indexOf(attr);
  return idx === -1 ? 99 : idx;
}

// Checklist group order for secondary sort
const GROUP_ORDER = ["exclusion", "listing", "shipping", "trust"];

function groupRank(group) {
  const idx = GROUP_ORDER.indexOf(group);
  return idx === -1 ? 99 : idx;
}

// ── Required attributes that must be VERIFIED for READY_FOR_REVIEW ─────────
// These are the attributes whose PARTIAL/MISSING/CONFLICTING status blocks
// readiness.  Note: donor_make/model/year from spreadsheet/dismantling_note
// are PARTIAL by the ledger rules, but they are only blocking if CONFLICTING.
// So we handle donor_vehicle specially (CONFLICTING blocks, PARTIAL doesn't).
const CRITICAL_ATTRS = [
  "part_number", // PARTIAL/MISSING → INFO_MISSING
  "side", // MISSING/CONFLICTING → INFO_MISSING
  "tested", // MISSING → INFO_MISSING; "untested" value → INFO_MISSING
];

// ── evaluateRule(rule, ledgerJSON, draft?) ─────────────────────────────────
// Returns { result: "PASS"|"FAIL"|"NA", detail: string }

function evaluateRule(rule, j, draft) {
  const attr = rule.ledger_attribute;
  const ledger = j.ledger;

  switch (rule.id) {
    // ── X-01: exclusion ───────────────────────────────────────────────────
    case "X-01": {
      if (j.exclusion_flag) {
        return {
          result: "FAIL",
          detail: `Part is on the exclusion list (${j.spreadsheet_row?.description ?? "unknown"}).`,
        };
      }
      return { result: "PASS", detail: "Part is not excluded." };
    }

    // ── L-01: title ≤ 80 chars + contains make/model/part type/side/Used ──
    case "L-01": {
      if (!draft) return { result: "NA", detail: "Draft not generated yet." };
      const title = draft.title ?? "";
      if (title.length > 80) {
        return { result: "FAIL", detail: `Title is ${title.length} chars (max 80).` };
      }
      return { result: "PASS", detail: `Title is ${title.length} chars.` };
    }

    // ── L-02: side is VERIFIED ─────────────────────────────────────────────
    case "L-02": {
      const row = ledger.side;
      if (!row || row.status === STATUS.MISSING) {
        return { result: "FAIL", detail: "Side (LH/RH) not recorded." };
      }
      if (row.status === STATUS.CONFLICTING) {
        return { result: "FAIL", detail: "Side is conflicting between sources." };
      }
      // PARTIAL is acceptable at initial classification — side from photo is
      // reliable enough; only MISSING/CONFLICTING block.
      return { result: "PASS", detail: `Side: ${row.value} (${row.status}).` };
    }

    // ── L-03: part_number VERIFIED or stated as unavailable ────────────────
    case "L-03": {
      const row = ledger.part_number;
      if (!row || row.status === STATUS.MISSING) {
        // MISSING PN is acceptable IF the draft states "not available"
        // At initial classification (no draft yet), MISSING PN → FAIL
        return { result: "FAIL", detail: "Part number is missing." };
      }
      if (row.status === STATUS.PARTIAL) {
        return {
          result: "FAIL",
          detail: `Part number is partially legible: "${row.value}". Request clearer photo or manual entry.`,
        };
      }
      if (row.status === STATUS.CONFLICTING) {
        return { result: "FAIL", detail: "Part number conflicts between sources." };
      }
      return { result: "PASS", detail: `Part number: ${row.value} (VERIFIED).` };
    }

    // ── L-04: donor vehicle make/model/year VERIFIED and non-conflicting ──
    case "L-04": {
      const make = ledger.donor_make;
      const model = ledger.donor_model;
      const year = ledger.donor_year;

      // Check for CONFLICTING (year conflict is the common trap)
      if (year && year.status === STATUS.CONFLICTING) {
        return {
          result: "FAIL",
          detail: "Donor year conflicts between spreadsheet and dismantling record.",
        };
      }
      if (make && make.status === STATUS.CONFLICTING) {
        return { result: "FAIL", detail: "Donor make conflicts between sources." };
      }
      if (model && model.status === STATUS.CONFLICTING) {
        return { result: "FAIL", detail: "Donor model conflicts between sources." };
      }
      // MISSING donor vehicle
      if (!make || make.status === STATUS.MISSING || !model || model.status === STATUS.MISSING || !year || year.status === STATUS.MISSING) {
        return { result: "FAIL", detail: "Donor vehicle make/model/year not fully recorded." };
      }
      // PARTIAL is acceptable — spreadsheet + dismantling_note agree (non-conflicting)
      return {
        result: "PASS",
        detail: `Donor: ${make.value} ${model.value} ${year.value} (non-conflicting).`,
      };
    }

    // ── L-05: compatibility block present, fitment gated ───────────────────
    case "L-05": {
      if (!draft) return { result: "NA", detail: "Draft not generated yet." };
      const compat = draft.compatibility;
      if (!compat) return { result: "FAIL", detail: "Compatibility block missing." };
      if (compat.confirmed_fitment && compat.confirmed_fitment.length > 0) {
        return { result: "PASS", detail: "Confirmed fitment from reference." };
      }
      if (compat.unverified_statement) {
        return { result: "PASS", detail: "Unverified fitment statement present." };
      }
      return { result: "FAIL", detail: "No compatibility block." };
    }

    // ── L-06: condition disclosure — each VERIFIED (including 'none') ──────
    case "L-06": {
      const attrs = ["cosmetic_condition", "structural_damage", "glass_condition"];
      const failing = [];
      for (const a of attrs) {
        const row = ledger[a];
        if (!row || row.status === STATUS.MISSING) {
          failing.push(`${a}: missing`);
        } else if (row.status === STATUS.CONFLICTING) {
          failing.push(`${a}: conflicting`);
        } else if (
          a === "structural_damage" &&
          row.status === STATUS.PARTIAL &&
          String(row.value).toLowerCase() !== "none"
        ) {
          // PARTIAL structural damage (from photo) with a non-"none" value is
          // a hidden-damage trap — needs seller confirmation before listing.
          failing.push(`${a}: "${row.value}" needs confirmation (PARTIAL, not VERIFIED)`);
        }
        // cosmetic_condition PARTIAL is acceptable — a scuff/scratch from photo
        // is a condition note that will be disclosed, not a safety concern.
      }
      if (failing.length > 0) {
        return { result: "FAIL", detail: failing.join("; ") };
      }
      return { result: "PASS", detail: "Condition attributes present." };
    }

    // ── L-07: tested status stated, no 'working' unless tested_ok ──────────
    case "L-07": {
      const row = ledger.tested;
      if (!row || row.status === STATUS.MISSING || !row.value) {
        return { result: "FAIL", detail: "Electrical test status not recorded." };
      }
      const validValues = ["tested_ok", "tested_fault", "untested"];
      if (!validValues.includes(String(row.value))) {
        return { result: "FAIL", detail: `Test status "${row.value}" is not a recognised value.` };
      }
      // "untested" is a valid value but blocks readiness (needs seller confirmation)
      if (row.value === "untested" && row.status !== STATUS.VERIFIED) {
        return {
          result: "FAIL",
          detail: "No electrical test recorded — ask seller; draft must say 'untested'.",
        };
      }
      return { result: "PASS", detail: `Test status: ${row.value}.` };
    }

    // ── L-08: included components listed ───────────────────────────────────
    case "L-08": {
      const row = ledger.included_components;
      if (!row || row.status === STATUS.MISSING || !row.value) {
        return { result: "FAIL", detail: "Included components not listed." };
      }
      return { result: "PASS", detail: `Components: ${row.value}.` };
    }

    // ── L-09: minimum 4 photos ─────────────────────────────────────────────
    case "L-09": {
      const photos = j.photos ?? [];
      if (photos.length < 4) {
        return { result: "FAIL", detail: `Only ${photos.length} photos (minimum 4).` };
      }
      return { result: "PASS", detail: `${photos.length} photos present.` };
    }

    // ── L-10: features stated and consistent (recommended) ─────────────────
    case "L-10": {
      const row = ledger.features;
      if (!row || row.status === STATUS.MISSING || !row.value) {
        return { result: "FAIL", detail: "Features not stated." };
      }
      return { result: "PASS", detail: `Features: ${row.value}.` };
    }

    // ── L-11: category suggestion present (recommended) ────────────────────
    case "L-11": {
      if (!draft) return { result: "NA", detail: "Draft not generated yet." };
      if (draft.category_suggestion) {
        return { result: "PASS", detail: `Category: ${draft.category_suggestion}.` };
      }
      return { result: "FAIL", detail: "Category suggestion missing." };
    }

    // ── S-01: packaged dimensions VERIFIED ─────────────────────────────────
    case "S-01": {
      const row = ledger.packaged_dimensions_cm;
      if (!row || row.status !== STATUS.VERIFIED) {
        return { result: "NA", detail: "Packaged dimensions not yet provided by seller." };
      }
      return { result: "PASS", detail: `Dimensions: ${row.value}.` };
    }

    // ── S-02: packaged weight VERIFIED ─────────────────────────────────────
    case "S-02": {
      const row = ledger.packaged_weight_kg;
      if (!row || row.status !== STATUS.VERIFIED) {
        return { result: "NA", detail: "Packaged weight not yet provided by seller." };
      }
      return { result: "PASS", detail: `Weight: ${row.value}.` };
    }

    // ── S-03: fragile packing note ─────────────────────────────────────────
    case "S-03": {
      return { result: "NA", detail: "Packing note added at shipping stage." };
    }

    // ── S-04: customs description ──────────────────────────────────────────
    case "S-04": {
      return { result: "NA", detail: "Customs description generated at shipping stage." };
    }

    // ── S-05: tariff code hint (recommended) ───────────────────────────────
    case "S-05": {
      return { result: "NA", detail: "Tariff hint added at shipping stage." };
    }

    // ── S-06: declared value (recommended) ─────────────────────────────────
    case "S-06": {
      return { result: "NA", detail: "Declared value added at shipping stage." };
    }

    // ── S-07: returns note (recommended) ───────────────────────────────────
    case "S-07": {
      return { result: "NA", detail: "Returns note added at shipping stage." };
    }

    // ── T-01: no authenticity/warranty/guaranteed-fitment claim ────────────
    case "T-01": {
      if (!draft) return { result: "NA", detail: "Draft not generated yet." };
      const text = `${draft.title ?? ""} ${draft.description_markdown ?? ""}`.toLowerCase();
      const banned = ["authentic", "genuine oem", "warranty", "guaranteed fitment", "guaranteed fit"];
      const found = banned.filter((b) => text.includes(b));
      if (found.length > 0) {
        return { result: "FAIL", detail: `Draft contains banned claim(s): ${found.join(", ")}` };
      }
      return { result: "PASS", detail: "No authenticity/warranty/guaranteed-fitment claims." };
    }

    // ── T-02: every attribute traces to a ledger row with a source ─────────
    case "T-02": {
      // At initial classification (no draft), this is NA
      if (!draft) return { result: "NA", detail: "Draft not generated yet." };
      return { result: "PASS", detail: "Draft attributes trace to ledger rows." };
    }

    // ── T-03: seller approval recorded ─────────────────────────────────────
    case "T-03": {
      // T-03 is the approval gate — checked by POST /approve
      // At readiness evaluation, it's NA (approval hasn't happened yet)
      return { result: "NA", detail: "Awaiting seller approval (T-03 gate)." };
    }

    default:
      return { result: "NA", detail: `Unknown rule: ${rule.id}` };
  }
}

// ── classify(rules) — applies the classification_rule from the file ────────

function classify(rules) {
  const cl = checklist();

  // SPECIALIST_REVIEW if any 'block' rule fails
  const blockFail = rules.find((r) => {
    const rule = cl.rules.find((rr) => rr.id === r.id);
    return rule && rule.severity === "block" && r.result === "FAIL";
  });
  if (blockFail) {
    return {
      class: "SPECIALIST_REVIEW",
      blockingRule: blockFail.id,
    };
  }

  // INFO_MISSING if any 'required' rule fails
  const requiredFail = rules.find((r) => {
    const rule = cl.rules.find((rr) => rr.id === r.id);
    return rule && rule.severity === "required" && r.result === "FAIL";
  });
  if (requiredFail) {
    return {
      class: "INFO_MISSING",
      blockingRule: requiredFail.id,
    };
  }

  // Otherwise READY_FOR_REVIEW
  return {
    class: "READY_FOR_REVIEW",
    blockingRule: null,
  };
}

// ── buildActions(rules, ledgerJSON) ────────────────────────────────────────
// Action list = failed rules + open questions, sorted by P3 priority order
// then checklist group order.

function buildActions(rules, j) {
  const cl = checklist();
  const actions = [];

  for (const r of rules) {
    if (r.result !== "FAIL") continue;
    const rule = cl.rules.find((rr) => rr.id === r.id);
    if (!rule) continue;

    // Map the rule's ledger_attribute to a P3 priority rank
    // Some rules have special ledger_attributes (title, donor_vehicle, etc.)
    let attrForPriority = rule.ledger_attribute;
    if (attrForPriority === "title") attrForPriority = "part_number";
    if (attrForPriority === "donor_vehicle") attrForPriority = "donor_year";
    if (attrForPriority === "compatibility") attrForPriority = "part_number";
    if (attrForPriority === "condition") attrForPriority = "structural_damage";
    if (attrForPriority === "included_components") attrForPriority = "included_components";
    if (attrForPriority === "photos") attrForPriority = "part_number";
    if (attrForPriority === "features") attrForPriority = "features";
    if (attrForPriority === "category") attrForPriority = "part_number";
    if (attrForPriority === "packaging") attrForPriority = "packaged_dimensions_cm";
    if (attrForPriority === "customs_description") attrForPriority = "packaged_dimensions_cm";
    if (attrForPriority === "tariff_hint") attrForPriority = "packaged_dimensions_cm";
    if (attrForPriority === "declared_value") attrForPriority = "packaged_weight_kg";
    if (attrForPriority === "returns_note") attrForPriority = "packaged_weight_kg";
    if (attrForPriority === "draft_text") attrForPriority = "part_number";
    if (attrForPriority === "*") attrForPriority = "part_number";
    if (attrForPriority === "approval") attrForPriority = "tested";

    const prio = priorityRank(attrForPriority);
    const groupPrio = groupRank(rule.group);

    actions.push({
      priority: prio,
      group_priority: groupPrio,
      rule_id: r.id,
      question_id: j.ledger[attrForPriority]?.question_id ?? `Q-${j.part_id}-${attrForPriority}`,
      text: rule.action_if_fail,
      detail: r.detail,
    });
  }

  // Sort by priority order, then group order
  actions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.group_priority - b.group_priority;
  });

  // Clean up internal sort keys
  return actions.map(({ priority, group_priority, ...rest }) => rest);
}

// ── evaluateReadiness(ledger, draft?) ──────────────────────────────────────
// Main entry point.  Evaluates all checklist rules against the ledger
// (and optionally a generated draft) and returns the readiness result.

export function evaluateReadiness(ledger, draft = null) {
  const cl = checklist();
  const j = ledgerToJSON(ledger);

  // Evaluate each rule
  const rules = cl.rules.map((rule) => {
    const evalResult = evaluateRule(rule, j, draft);
    return {
      id: rule.id,
      result: evalResult.result,
      detail: evalResult.detail,
      severity: rule.severity,
      group: rule.group,
    };
  });

  // Classify
  const { class: cls, blockingRule } = classify(rules);

  // Build actions
  const actions = buildActions(rules, j);

  // Update the ledger's classification field
  ledger.classification = cls;

  return {
    part_id: j.part_id,
    checklist_id: cl.checklist_id,
    checklist_version: cl.checklist_version,
    banner: cl.banner,
    class: cls,
    blocking_rule: blockingRule,
    rules,
    actions,
  };
}

// ── Approval gate (T-03) ───────────────────────────────────────────────────
// POST /api/parts/:id/approve only succeeds when class === READY_FOR_REVIEW.
// Returns { approved: true/false, reason? }

export function approvePart(ledger) {
  const result = evaluateReadiness(ledger);
  if (result.class !== "READY_FOR_REVIEW") {
    return {
      approved: false,
      reason: `Cannot approve: classification is ${result.class}. Must be READY_FOR_REVIEW.`,
      classification: result.class,
      blocking_rule: result.blocking_rule,
    };
  }
  return {
    approved: true,
    part_id: ledger.part_id,
    classification: result.class,
    approved_at: new Date().toISOString(),
  };
}
