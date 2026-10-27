// scripts/evaluate.js — evaluation harness (spec §8)
//
// Runs ingest + readiness for all 20 parts, compares against
// data/answer_key.json, and prints:
//   - traps detected / traps present
//   - attributes correct / total
//   - condition disclosures present / required
//   - classification accuracy
//
// Saves full results to results/eval_<timestamp>.json.
//
// Run:  MOCK=1 node scripts/evaluate.js
//   or: node scripts/evaluate.js          (needs server running on :3000)
//   or: node scripts/evaluate.js --direct (no server, imports modules directly)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const RESULTS = join(ROOT, "results");

if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });

// ── Load answer key ────────────────────────────────────────────────────────

const answerKey = JSON.parse(readFileSync(join(DATA, "answer_key.json"), "utf8"));

// ── Trap → readiness rule mapping ──────────────────────────────────────────
// Each trap in the answer key maps to one or more readiness rules that should
// FAIL when the trap is present.

const TRAP_TO_RULES = {
  PARTIAL_PN: ["L-03"],
  MISSING_PN: ["L-03"],
  MISSING_SIDE: ["L-02"],
  UNTESTED: ["L-07"],
  HIDDEN_DAMAGE: ["L-06"],
  CONFLICT_YEAR: ["L-04"],
  EXCLUDED: ["X-01"],
  AR_ONLY: [], // AR_ONLY is about source utilisation, not a readiness rule per se
};

// ── Attribute mapping: ledger attr → answer_key ground_truth key ───────────

const ATTR_MAP = [
  { ledger: "donor_make", gt: "make" },
  { ledger: "donor_model", gt: "model" },
  { ledger: "donor_year", gt: "year", cast: "number" },
  { ledger: "side", gt: "side" },
  { ledger: "part_number", gt: "pn", partial: true },
  { ledger: "features", gt: "features" },
  { ledger: "tested", gt: "tested" },
  { ledger: "cosmetic_condition", gt: "cosmetic" },
  { ledger: "structural_damage", gt: "structural" },
  { ledger: "glass_condition", gt: "glass" },
  { ledger: "included_components", gt: "comps" },
];

// ── Direct mode (no server) ────────────────────────────────────────────────

function mod(name) {
  return pathToFileURL(join(ROOT, "src", name)).href;
}

async function runDirect() {
  process.env.MOCK = process.env.MOCK || "1";
  const { loadAll } = await import(mod("loader.js"));
  const { ingestPart } = await import(mod("ingest.js"));
  const { evaluateReadiness } = await import(mod("readiness.js"));
  const { generateDraft } = await import(mod("draft.js"));
  const { ledgerToJSON } = await import(mod("ledger.js"));

  const ledgers = loadAll(DATA);
  const results = [];

  for (const ledger of ledgers) {
    await ingestPart(ledger);
    const ready = evaluateReadiness(ledger);
    const json = ledgerToJSON(ledger);

    // Generate draft (may be blocked by G3/G4)
    let draftResult = null;
    try {
      draftResult = await generateDraft(ledger);
    } catch (err) {
      draftResult = { blocked: true, error: err.message };
    }

    results.push({ ledger, ready, json, draftResult });
  }

  return results;
}

// ── HTTP mode (server on :3000) ────────────────────────────────────────────

async function runHTTP() {
  const BASE = "http://localhost:3000";

  const partsResp = await fetch(`${BASE}/api/parts`);
  const { parts } = await partsResp.json();

  const results = [];

  for (const part of parts) {
    const partId = part.part_id;

    await fetch(`${BASE}/api/parts/${partId}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const readyResp = await fetch(`${BASE}/api/parts/${partId}/readiness`);
    const ready = await readyResp.json();

    const jsonResp = await fetch(`${BASE}/api/parts/${partId}`);
    const json = await jsonResp.json();

    const draftResp = await fetch(`${BASE}/api/parts/${partId}/draft`);
    const draftResult = await draftResp.json();

    results.push({ ledger: null, ready, json, draftResult });
  }

  return results;
}

// ── Evaluate one part against answer key ───────────────────────────────────

function evalPart(result, expected) {
  const ready = result.ready;
  const json = result.json;
  const draftResult = result.draftResult;
  const partId = expected.part_id;

  // ── 1. Classification accuracy ──
  const expectedClass = expected.expected_initial_classification;
  const actualClass = ready.class;
  const classMatch = actualClass === expectedClass;

  // ── 2. Trap detection ──
  // For each trap in expected.traps, check if the corresponding readiness
  // rule(s) FAILED.
  const expectedTraps = expected.traps || [];
  const failedRules = (ready.rules || [])
    .filter((r) => r.result === "FAIL")
    .map((r) => r.id);

  const trapsDetected = [];
  const trapsMissed = [];

  for (const trap of expectedTraps) {
    const rulesForTrap = TRAP_TO_RULES[trap] || [];
    if (rulesForTrap.length === 0) {
      // AR_ONLY: the Arabic note was translated and used by ingest.
      // Detected if translated_notes.ar_to_en exists on the ledger.
      if (trap === "AR_ONLY") {
        const arTranslated = !!json.notes?.ar_to_en;
        if (arTranslated) {
          trapsDetected.push(trap);
        } else {
          trapsMissed.push(trap);
        }
      }
      continue;
    }

    // For MISSING_SIDE: the trap is "present" (no side in spreadsheet) but
    // may be resolved by the ingest step (side detected from photo). If the
    // ledger has a side value (any status except MISSING), the trap was
    // detected and resolved.
    if (trap === "MISSING_SIDE") {
      const sideRow = json.ledger?.side;
      if (sideRow && sideRow.status !== "MISSING") {
        trapsDetected.push(trap);
      } else {
        trapsMissed.push(trap);
      }
      continue;
    }

    const detected = rulesForTrap.some((r) => failedRules.includes(r));
    if (detected) {
      trapsDetected.push(trap);
    } else {
      trapsMissed.push(trap);
    }
  }

  // ── 3. Attribute correctness ──
  // Compare resolved ledger values to ground_truth, allowing PARTIAL values
  // (with '?') to match the non-? prefix of the ground truth.
  const gt = expected.ground_truth || {};
  const attrResults = [];
  let attrsCorrect = 0;
  let attrsTotal = 0;

  for (const { ledger: attr, gt: gtKey, cast, partial } of ATTR_MAP) {
    const expectedVal = gt[gtKey];
    if (expectedVal === undefined || expectedVal === "") {
      // Ground truth says this attr is not applicable / not recorded
      // Skip — not counted in denominator
      continue;
    }
    attrsTotal++;

    const row = json.ledger?.[attr];
    const actualVal = row?.value;

    let correct = false;
    if (actualVal === null || actualVal === undefined) {
      correct = false;
    } else if (cast === "number") {
      correct = Number(actualVal) === Number(expectedVal);
    } else if (partial && String(expectedVal).includes("?")) {
      // For partial PN: check that the readable (non-?) prefix matches
      const readableExpected = String(expectedVal).replace(/\?/g, "");
      const actualStr = String(actualVal).replace(/\?/g, "");
      correct = actualStr.startsWith(readableExpected.replace(/\?+$/, "")) ||
        readableExpected.startsWith(actualStr);
    } else {
      correct = String(actualVal).toLowerCase() === String(expectedVal).toLowerCase();
    }

    if (correct) attrsCorrect++;
    attrResults.push({ attr, expected: expectedVal, actual: actualVal, correct });
  }

  // ── 4. Condition disclosures ──
  // Check if the ledger has values for the 4 condition disclosure fields.
  // The draft's condition_disclosure block is built from these ledger values
  // by the guardrail code (guardrails.js line 267-272), so presence in the
  // ledger == presence in the draft (when the draft is generated).
  // For excluded parts (SPECIALIST_REVIEW), no draft is generated so CD is NA.
  const cdAttrs = ["cosmetic_condition", "structural_damage", "glass_condition", "tested"];
  let cdPresent = 0;
  let cdRequired = 0;

  if (expectedClass === "SPECIALIST_REVIEW") {
    // Excluded parts: no draft, condition disclosures NA
    cdRequired = 0;
  } else {
    for (const attr of cdAttrs) {
      cdRequired++;
      const row = json.ledger?.[attr];
      if (row && row.value !== null && row.value !== undefined && row.value !== "") {
        cdPresent++;
      }
    }
  }

  return {
    part_id: partId,
    classification: {
      expected: expectedClass,
      actual: actualClass,
      match: classMatch,
    },
    traps: {
      expected: expectedTraps,
      detected: trapsDetected,
      missed: trapsMissed,
    },
    attributes: {
      correct: attrsCorrect,
      total: attrsTotal,
      details: attrResults,
    },
    condition_disclosures: {
      present: cdPresent,
      required: cdRequired,
    },
    failed_rules: failedRules,
  };
}

// ── Aggregate + print ──────────────────────────────────────────────────────

function aggregate(partResults) {
  let totalTrapsPresent = 0;
  let totalTrapsDetected = 0;
  let totalAttrsCorrect = 0;
  let totalAttrsTotal = 0;
  let totalCdPresent = 0;
  let totalCdRequired = 0;
  let classMatches = 0;

  for (const p of partResults) {
    totalTrapsPresent += p.traps.expected.length;
    totalTrapsDetected += p.traps.detected.length;
    totalAttrsCorrect += p.attributes.correct;
    totalAttrsTotal += p.attributes.total;
    totalCdPresent += p.condition_disclosures.present;
    totalCdRequired += p.condition_disclosures.required;
    if (p.classification.match) classMatches++;
  }

  return {
    classification_accuracy: `${classMatches}/${partResults.length} (${Math.round((classMatches / partResults.length) * 100)}%)`,
    traps_detected: `${totalTrapsDetected}/${totalTrapsPresent}`,
    attributes_correct: `${totalAttrsCorrect}/${totalAttrsTotal} (${totalAttrsTotal > 0 ? Math.round((totalAttrsCorrect / totalAttrsTotal) * 100) : 0}%)`,
    condition_disclosures_present: `${totalCdPresent}/${totalCdRequired}`,
  };
}

function printReport(partResults, summary) {
  console.log("\n┌──────────┬──────────────────────┬──────────────────────┬───────┬────────────────┬──────────────────┐");
  console.log("│ part_id  │ class (actual)       │ expected             │ match │ traps det/total │ attrs corr/total │");
  console.log("├──────────┼──────────────────────┼──────────────────────┼───────┼────────────────┼──────────────────┤");

  for (const p of partResults) {
    const cls = p.classification.actual.padEnd(20);
    const exp = p.classification.expected.padEnd(20);
    const match = (p.classification.match ? "✓" : "✗").padEnd(5);
    const traps = `${p.traps.detected.length}/${p.traps.expected.length}`.padEnd(14);
    const attrs = `${p.attributes.correct}/${p.attributes.total}`.padEnd(16);
    console.log(`│ ${p.part_id.padEnd(8)} │ ${cls} │ ${exp} │ ${match} │ ${traps} │ ${attrs} │`);
  }

  console.log("└──────────┴──────────────────────┴──────────────────────┴───────┴────────────────┴──────────────────┘");

  console.log("\n=== Summary ===");
  console.log(`  Classification accuracy:   ${summary.classification_accuracy}`);
  console.log(`  Traps detected:            ${summary.traps_detected}`);
  console.log(`  Attributes correct:        ${summary.attributes_correct}`);
  console.log(`  Condition disclosures:     ${summary.condition_disclosures_present}`);

  // Detail missed traps
  const missedTraps = partResults.filter((p) => p.traps.missed.length > 0);
  if (missedTraps.length > 0) {
    console.log("\n=== Missed traps ===");
    for (const p of missedTraps) {
      console.log(`  ${p.part_id}: missed ${p.traps.missed.join(", ")}`);
    }
  }

  // Detail wrong classifications
  const wrongClass = partResults.filter((p) => !p.classification.match);
  if (wrongClass.length > 0) {
    console.log("\n=== Wrong classifications ===");
    for (const p of wrongClass) {
      console.log(`  ${p.part_id}: got ${p.classification.actual}, expected ${p.classification.expected}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

const useDirect = process.argv.includes("--direct");

let rawResults;
if (useDirect) {
  rawResults = await runDirect();
} else {
  try {
    rawResults = await runHTTP();
  } catch (err) {
    console.error("Server not reachable. Use --direct flag to run without server.");
    console.error(err.message);
    process.exit(1);
  }
}

const partResults = rawResults.map((r, i) => {
  const expected = answerKey[i];
  return evalPart(r, expected);
});

const summary = aggregate(partResults);
printReport(partResults, summary);

// Save results
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = join(RESULTS, `eval_${ts}.json`);
writeFileSync(outPath, JSON.stringify({ timestamp: ts, summary, parts: partResults }, null, 2));
console.log(`\nResults saved to ${outPath}`);

const allPass = partResults.every((p) => p.classification.match) &&
  partResults.every((p) => p.traps.missed.length === 0);
process.exit(allPass ? 0 : 1);
