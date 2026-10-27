// scripts/seed_demo.js — load the 10-part demo inventory into the DB
//
// Selects MIR-001 (clean / READY_FOR_REVIEW), MIR-004 (hard case /
// INFO_MISSING — conflicting year, partial label, possible mounting-tab
// damage, untested) and 8 more mirrors, runs ingest on each, and persists
// the resulting ledger + classification to SQLite.
//
// This gives the demo a realistic starting state: parts on the board with
// correct classifications, open questions, and evidence ledgers — without
// any seller confirmations yet.
//
// Run:  MOCK=1 node scripts/seed_demo.js

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

// ── 10 parts for the demo ──────────────────────────────────────────────────
// MIR-001  clean (READY_FOR_REVIEW) — normal journey
// MIR-002  clean (READY_FOR_REVIEW)
// MIR-003  partial PN + untested (INFO_MISSING)
// MIR-004  hard case (INFO_MISSING) — year conflict, partial label, hidden damage, untested
// MIR-005  partial PN (INFO_MISSING)
// MIR-006  tested_fault (READY_FOR_REVIEW)
// MIR-007  partial PN + hidden damage + untested + AR_ONLY (INFO_MISSING)
// MIR-008  clean (READY_FOR_REVIEW)
// MIR-009  partial PN + untested + missing side (INFO_MISSING)
// MIR-017  year conflict (INFO_MISSING)
const DEMO_PARTS = [
  "MIR-001",
  "MIR-002",
  "MIR-003",
  "MIR-004",
  "MIR-005",
  "MIR-006",
  "MIR-007",
  "MIR-008",
  "MIR-009",
  "MIR-017",
];

async function main() {
  process.env.MOCK = process.env.MOCK || "1";

  // Load source modules
  const loaderURL = pathToFileURL(join(ROOT, "src", "loader.js")).href;
  const { loadAll } = await import(loaderURL);
  const ingestURL = pathToFileURL(join(ROOT, "src", "ingest.js")).href;
  const { ingestPart } = await import(ingestURL);
  const readinessURL = pathToFileURL(join(ROOT, "src", "readiness.js")).href;
  const { evaluateReadiness } = await import(readinessURL);
  const ledgerURL = pathToFileURL(join(ROOT, "src", "ledger.js")).href;
  const { ledgerToJSON } = await import(ledgerURL);

  // Load all parts from the test pack
  const allLedgers = loadAll(DATA);
  const byId = new Map(allLedgers.map((l) => [l.part_id, l]));

  // Open SQLite
  const dbPath = join(ROOT, "salvagescribe.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Recreate the parts table (clean slate for demo)
  db.exec(`DROP TABLE IF EXISTS parts`);
  db.exec(`
    CREATE TABLE parts (
      part_id          TEXT PRIMARY KEY,
      ledger_json      TEXT NOT NULL,
      classification   TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const upsert = db.prepare(`
    INSERT INTO parts (part_id, ledger_json, classification, updated_at)
    VALUES (@part_id, @ledger_json, @classification, datetime('now'))
    ON CONFLICT(part_id) DO UPDATE SET
      ledger_json = excluded.ledger_json,
      classification = excluded.classification,
      updated_at = datetime('now')
  `);

  const seedOne = db.transaction((partId) => {
    const l = byId.get(partId);
    if (!l) {
      throw new Error(`Part ${partId} not found in test pack`);
    }
    const j = ledgerToJSON(l);
    upsert.run({
      part_id: j.part_id,
      ledger_json: JSON.stringify(j),
      classification: j.classification,
    });
  });

  const seedAll = db.transaction(() => {
    for (const partId of DEMO_PARTS) {
      seedOne(partId);
    }
  });

  // ── Run ingest + readiness on each demo part, then persist ──────────────
  console.log(`Seeding ${DEMO_PARTS.length} demo parts into ${dbPath}...\n`);

  const results = [];

  for (const partId of DEMO_PARTS) {
    const l = byId.get(partId);
    if (!l) {
      console.error(`  ✗ ${partId}: not found in test pack`);
      continue;
    }

    // Ingest (populates photo-based attributes from mock responses)
    await ingestPart(l);

    // Evaluate readiness (sets classification)
    const ready = evaluateReadiness(l);

    // Persist to SQLite
    const j = ledgerToJSON(l);
    upsert.run({
      part_id: j.part_id,
      ledger_json: JSON.stringify(j),
      classification: ready.class,
    });

    const openAttrs = Object.values(j.ledger).filter(
      (row) => row.status && row.status !== "VERIFIED",
    ).length;

    console.log(
      `  ✓ ${partId}: ${ready.class.padEnd(20)} ${openAttrs} open attrs`,
    );
    results.push({
      part_id: partId,
      classification: ready.class,
      open_attrs: openAttrs,
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const byClass = {};
  for (const r of results) {
    byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  }

  console.log(`\nSeeded ${results.length} parts:`);
  for (const [cls, count] of Object.entries(byClass)) {
    console.log(`  ${cls}: ${count}`);
  }

  // Verify
  const count = db.prepare("SELECT COUNT(*) as n FROM parts").get();
  console.log(`\nDB now has ${count.n} parts.`);

  db.close();
  console.log("\nDone. Start the server with: npm start");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
