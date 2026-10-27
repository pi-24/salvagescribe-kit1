// scripts/test_p5_readiness.js — P5 readiness classification tests
//
// Runs the readiness engine over all 20 parts (after ingest), evaluates
// every checklist rule in code, and compares the classification to
// data/answer_key.json expected_initial_classification.
//
// Prints a table:  part_id | class | failed rule ids
//
// Run: node scripts/test_p5_readiness.js  (after starting server with MOCK=1)
//   OR: node scripts/test_p5_readiness.js --direct  (runs without server)

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

function mod(name) {
  return pathToFileURL(join(ROOT, "src", name)).href;
}

// ── Direct mode: import modules and run without a server ───────────────────

async function runDirect() {
  process.env.MOCK = "1";
  const { loadAll } = await import(mod("loader.js"));
  const { ingestPart } = await import(mod("ingest.js"));
  const { evaluateReadiness, approvePart } = await import(mod("readiness.js"));

  const ledgers = loadAll(DATA);
  const answerKey = JSON.parse(readFileSync(join(DATA, "answer_key.json"), "utf8"));

  const results = [];

  for (const ledger of ledgers) {
    // Simulate ingest (populates photo-based attributes from mock responses)
    await ingestPart(ledger);

    // Evaluate readiness
    const result = evaluateReadiness(ledger);

    // Collect failed rule IDs
    const failedRules = result.rules
      .filter((r) => r.result === "FAIL")
      .map((r) => r.id);

    // Get expected classification from answer key
    const expected = answerKey.find((a) => a.part_id === ledger.part_id);
    const expectedClass = expected?.expected_initial_classification ?? "???";

    results.push({
      part_id: ledger.part_id,
      class: result.class,
      expected: expectedClass,
      match: result.class === expectedClass,
      failed_rules: failedRules,
    });
  }

  return results;
}

// ── HTTP mode: use the running server ──────────────────────────────────────

async function runHTTP() {
  const BASE = "http://localhost:3000";
  const answerKey = JSON.parse(readFileSync(join(DATA, "answer_key.json"), "utf8"));

  // Get all parts
  const partsResp = await fetch(`${BASE}/api/parts`);
  const { parts } = await partsResp.json();

  const results = [];

  for (const part of parts) {
    const partId = part.part_id;

    // Ingest first (to populate photo-based attributes)
    await fetch(`${BASE}/api/parts/${partId}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    // Get readiness
    const readyResp = await fetch(`${BASE}/api/parts/${partId}/readiness`);
    const result = await readyResp.json();

    const failedRules = (result.rules ?? [])
      .filter((r) => r.result === "FAIL")
      .map((r) => r.id);

    const expected = answerKey.find((a) => a.part_id === partId);
    const expectedClass = expected?.expected_initial_classification ?? "???";

    results.push({
      part_id: partId,
      class: result.class,
      expected: expectedClass,
      match: result.class === expectedClass,
      failed_rules: failedRules,
    });
  }

  return results;
}

// ── Print table + verify ───────────────────────────────────────────────────

function printTable(results) {
  console.log("\n┌──────────┬──────────────────────┬──────────────────────┬───────┬───────────────────┐");
  console.log("│ part_id  │ class                │ expected             │ match │ failed rule ids   │");
  console.log("├──────────┼──────────────────────┼──────────────────────┼───────┼───────────────────┤");

  for (const r of results) {
    const cls = r.class.padEnd(20);
    const exp = r.expected.padEnd(20);
    const match = (r.match ? "✓" : "✗").padEnd(5);
    const failed = (r.failed_rules.length > 0 ? r.failed_rules.join(", ") : "—").padEnd(17);
    console.log(`│ ${r.part_id.padEnd(8)} │ ${cls} │ ${exp} │ ${match} │ ${failed} │`);
  }

  console.log("└──────────┴──────────────────────┴──────────────────────┴───────┴───────────────────┘");

  const allMatch = results.every((r) => r.match);
  const passed = results.filter((r) => r.match).length;
  console.log(`\n${passed}/${results.length} parts match expected classification.`);
  console.log(allMatch ? "\n✓ ALL 20 PARTS MATCH ANSWER KEY" : "\n✗ SOME PARTS DO NOT MATCH — see ✗ rows above.");

  return allMatch;
}

// ── Main ───────────────────────────────────────────────────────────────────

const useDirect = process.argv.includes("--direct");

let results;
if (useDirect) {
  results = await runDirect();
} else {
  try {
    results = await runHTTP();
  } catch (err) {
    console.error("Server not reachable. Use --direct flag to run without server.");
    console.error(err.message);
    process.exit(1);
  }
}

const allMatch = printTable(results);

// Also test the approval gate (T-03)
if (useDirect) {
  console.log("\n=== Approval gate (T-03) tests ===");
  const { loadAll } = await import(mod("loader.js"));
  const { ingestPart } = await import(mod("ingest.js"));
  const { approvePart, evaluateReadiness } = await import(mod("readiness.js"));

  const ledgers2 = loadAll(DATA);

  // Test approving a READY part (MIR-001)
  const l1 = ledgers2.find((l) => l.part_id === "MIR-001");
  await ingestPart(l1);
  const ready1 = evaluateReadiness(l1);
  if (ready1.class === "READY_FOR_REVIEW") {
    const approve1 = approvePart(l1);
    console.log(`  MIR-001 (READY): approve = ${approve1.approved ? "✓ approved" : "✗ rejected"} — ${approve1.approved ? "PASS" : approve1.reason}`);
  }

  // Test approving an INFO_MISSING part (MIR-003)
  const l3 = ledgers2.find((l) => l.part_id === "MIR-003");
  await ingestPart(l3);
  const ready3 = evaluateReadiness(l3);
  if (ready3.class === "INFO_MISSING") {
    const approve3 = approvePart(l3);
    console.log(`  MIR-003 (INFO_MISSING): approve = ${approve3.approved ? "✗ approved (should fail)" : "✓ rejected"} — ${approve3.approved ? "FAIL" : "PASS"}`);
  }

  // Test approving a SPECIALIST_REVIEW part (AIR-020)
  const l20 = ledgers2.find((l) => l.part_id === "AIR-020");
  const ready20 = evaluateReadiness(l20);
  if (ready20.class === "SPECIALIST_REVIEW") {
    const approve20 = approvePart(l20);
    console.log(`  AIR-020 (SPECIALIST_REVIEW): approve = ${approve20.approved ? "✗ approved (should fail)" : "✓ rejected"} — ${approve20.approved ? "FAIL" : "PASS"}`);
  }
}

process.exit(allMatch ? 0 : 1);
