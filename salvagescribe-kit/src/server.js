// src/server.js — Express backend for SalvageScribe (P1)
//
// Endpoints (P1 subset):
//   GET /api/parts        — board view with readiness class per part
//   GET /api/parts/:id    — full ledger JSON
//
// State is loaded into memory from the test pack on boot.  A SQLite file
// (better-sqlite3) is also initialised so later prompts can persist ledger
// confirmations without changing the data layer shape.

import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loadAll, loadPart } from "./loader.js";
import { ledgerToJSON } from "./ledger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ── SQLite (initialised for future use; P1 reads from in-memory cache) ─────
const DB_PATH = join(ROOT, "salvagescribe.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    part_id          TEXT PRIMARY KEY,
    ledger_json      TEXT NOT NULL,
    classification   TEXT,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── load test pack into memory + seed DB ────────────────────────────────────
const ledgers = loadAll(join(ROOT, "data"));

// Seed SQLite (overwrite any prior state for reproducibility in the prototype)
const upsert = db.prepare(`
  INSERT INTO parts (part_id, ledger_json, classification, updated_at)
  VALUES (@part_id, @ledger_json, @classification, datetime('now'))
  ON CONFLICT(part_id) DO UPDATE SET
    ledger_json = excluded.ledger_json,
    classification = excluded.classification,
    updated_at = datetime('now')
`);
const seedAll = db.transaction(() => {
  for (const l of ledgers) {
    const j = ledgerToJSON(l);
    upsert.run({
      part_id: j.part_id,
      ledger_json: JSON.stringify(j),
      classification: j.classification,
    });
  }
});
seedAll();

// in-memory cache keyed by part_id
const byId = new Map(ledgers.map((l) => [l.part_id, l]));

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "10mb" }));

// serve static frontend from /public (created in P6)
app.use(express.static(join(ROOT, "public")));

// GET /api/parts — board view: one summary card per part
app.get("/api/parts", (_req, res) => {
  const board = ledgers.map((l) => {
    const j = ledgerToJSON(l);
    const openAttrs = Object.values(j.ledger).filter(
      (row) => row.status && row.status !== "VERIFIED",
    ).length;
    return {
      part_id: j.part_id,
      title: j.spreadsheet_row?.description ?? j.part_id,
      thumbnail: j.photos[0]?.file ?? null,
      classification: j.classification ?? classifyInitial(j),
      exclusion_flag: j.exclusion_flag,
      open_questions: openAttrs,
    };
  });
  res.json({ count: board.length, parts: board });
});

// GET /api/parts/:id — full ledger JSON
app.get("/api/parts/:id", (req, res) => {
  const l = byId.get(req.params.id.toUpperCase());
  if (!l) {
    return res.status(404).json({ error: `Part ${req.params.id} not found` });
  }
  res.json(ledgerToJSON(l));
});

// ── minimal initial classification (full readiness is P5) ──────────────────
// Enough to colour the board before the checklist engine exists.
function classifyInitial(j) {
  if (j.exclusion_flag || j.classification === "SPECIALIST_REVIEW") {
    return "SPECIALIST_REVIEW";
  }
  // If any required attribute is not VERIFIED → INFO_MISSING.
  const required = [
    "part_type", "side", "part_number",
    "donor_make", "donor_model", "donor_year",
  ];
  const anyMissing = required.some((a) => {
    const row = j.ledger[a];
    return !row || row.status === "MISSING" || row.status === "CONFLICTING" ||
      row.status === "PARTIAL";
  });
  return anyMissing ? "INFO_MISSING" : "READY_FOR_REVIEW";
}

// ── health check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", parts: ledgers.length });
});

app.listen(PORT, () => {
  console.log(`SalvageScribe running on http://localhost:${PORT}`);
  console.log(`Loaded ${ledgers.length} parts into memory + SQLite.`);
});
