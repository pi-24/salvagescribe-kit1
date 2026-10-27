// src/server.js — Express backend for SalvageScribe (P1–P5)
//
// Endpoints:
//   GET  /api/parts             — board view with readiness class per part
//   GET  /api/parts/:id         — full ledger JSON
//   POST /api/parts/:id/ingest  — photos + csv row + notes → ledger (calls model)
//   GET  /api/parts/:id/questions?lang=en|ar — open questions, prioritised
//   POST /api/parts/:id/confirm — {attribute, value, lang} → VERIFIED, recompute
//   GET  /api/parts/:id/draft   — generate listing draft with guardrails
//   POST /api/parts/:id/draft/edit — store Noor's manual text edits
//   GET  /api/parts/:id/readiness — evaluate checklist rules → class + actions
//   POST /api/parts/:id/approve — T-03 approval gate (only if READY_FOR_REVIEW)
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
import { ingestPart } from "./ingest.js";
import { generateQuestions, confirmAnswer } from "./questions.js";
import { generateDraft, storeManualEdit, getManualEdits, applyManualEdits } from "./draft.js";
import { evaluateReadiness, approvePart } from "./readiness.js";
import { askAssistant } from "./assistant.js";

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
    // Use the readiness engine for classification if not yet set
    if (!j.classification) {
      const result = evaluateReadiness(l);
      j.classification = result.class;
    }
    const openAttrs = Object.values(j.ledger).filter(
      (row) => row.status && row.status !== "VERIFIED",
    ).length;
    return {
      part_id: j.part_id,
      title: j.spreadsheet_row?.description ?? j.part_id,
      thumbnail: j.photos[0]?.file ?? null,
      classification: j.classification,
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

// POST /api/parts/:id/ingest — photos + csv row + notes → ledger (calls model)
// In MOCK=1 mode, returns canned responses from data/mock_responses/.
app.post("/api/parts/:id/ingest", async (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  try {
    const result = await ingestPart(l);
    // Re-evaluate readiness classification after ingest
    const ready = evaluateReadiness(l);
    result.ledger_json.classification = ready.class;
    // Persist updated ledger to SQLite
    const j = result.ledger_json;
    upsert.run({
      part_id: j.part_id,
      ledger_json: JSON.stringify(j),
      classification: j.classification,
    });
    res.json(result);
  } catch (err) {
    console.error(`Ingest failed for ${partId}:`, err.message);
    res.status(500).json({ error: err.message, part_id: partId });
  }
});

// GET /api/parts/:id/questions?lang=en|ar — open questions, prioritised
app.get("/api/parts/:id/questions", async (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const lang = req.query.lang === "ar" ? "ar" : "en";
  try {
    const questions = await generateQuestions(l, lang);
    res.json({ part_id: partId, lang, questions });
  } catch (err) {
    console.error(`Questions failed for ${partId}:`, err.message);
    res.status(500).json({ error: err.message, part_id: partId });
  }
});

// POST /api/parts/:id/confirm — {attribute, value, lang} → VERIFIED, recompute
app.post("/api/parts/:id/confirm", async (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const { attribute, value, lang } = req.body;
  if (!attribute || value === undefined) {
    return res.status(400).json({
      error: "Request body must include { attribute, value }",
    });
  }

  try {
    const updatedLedger = confirmAnswer(l, attribute, value, lang || "en");
    // Re-evaluate readiness classification (confirm may have changed the class)
    const ready = evaluateReadiness(l);
    updatedLedger.classification = ready.class;
    // Persist to SQLite
    upsert.run({
      part_id: updatedLedger.part_id,
      ledger_json: JSON.stringify(updatedLedger),
      classification: updatedLedger.classification,
    });
    res.json({ part_id: partId, confirmed: attribute, ledger: updatedLedger, classification: ready.class });
  } catch (err) {
    console.error(`Confirm failed for ${partId}/${attribute}:`, err.message);
    res.status(500).json({ error: err.message, part_id: partId });
  }
});

// GET /api/parts/:id/draft — generate listing draft with guardrails
app.get("/api/parts/:id/draft", async (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  try {
    const result = await generateDraft(l);

    // If not blocked, apply any manual edits Noor has stored
    if (!result.blocked && result.draft) {
      const edited = applyManualEdits(partId, result.draft);
      result.draft = edited.draft;
      result.edits_applied = edited.edits_applied;
      result.edit_conflicts = edited.conflicts;
    }

    res.json(result);
  } catch (err) {
    console.error(`Draft failed for ${partId}:`, err.message);
    res.status(500).json({ error: err.message, part_id: partId });
  }
});

// POST /api/parts/:id/draft/edit — store Noor's manual text edits
// Body: { title?, description_markdown? }
// Edits are stored separately so a later ledger change regenerates the
// draft and re-applies her edits as a diff she can accept.
app.post("/api/parts/:id/draft/edit", (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const { title, description_markdown } = req.body;
  if (!title && !description_markdown) {
    return res.status(400).json({
      error: "Request body must include { title } or { description_markdown }",
    });
  }

  const edits = {};
  if (title) edits.title = title;
  if (description_markdown) edits.description_markdown = description_markdown;

  const stored = storeManualEdit(partId, edits);
  res.json({ part_id: partId, edits_stored: stored });
});

// GET /api/parts/:id/draft/edits — retrieve stored manual edits
app.get("/api/parts/:id/draft/edits", (req, res) => {
  const partId = req.params.id.toUpperCase();
  const edits = getManualEdits(partId);
  res.json({ part_id: partId, edits });
});

// GET /api/parts/:id/readiness — evaluate checklist rules → class + actions
app.get("/api/parts/:id/readiness", (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const result = evaluateReadiness(l);

  // Persist updated classification to SQLite
  upsert.run({
    part_id: partId,
    ledger_json: JSON.stringify(ledgerToJSON(l)),
    classification: result.class,
  });

  res.json(result);
});

// POST /api/parts/:id/approve — T-03 approval gate
// Only succeeds when class === READY_FOR_REVIEW.
app.post("/api/parts/:id/approve", (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const result = approvePart(l);
  if (!result.approved) {
    return res.status(409).json(result);
  }

  // Persist
  upsert.run({
    part_id: partId,
    ledger_json: JSON.stringify(ledgerToJSON(l)),
    classification: result.classification,
  });

  res.json(result);
});

// POST /api/parts/:id/ask — "Ask SalvageScribe" free-text assistant
// Body: { text, lang }
// Guardrail G5: refuses unsupported seller shortcuts; code-checks no ledger change.
app.post("/api/parts/:id/ask", async (req, res) => {
  const partId = req.params.id.toUpperCase();
  const l = byId.get(partId);
  if (!l) {
    return res.status(404).json({ error: `Part ${partId} not found` });
  }

  const { text, lang } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Request body must include { text }" });
  }

  try {
    const result = await askAssistant(l, text, lang || "en");
    res.json(result);
  } catch (err) {
    console.error(`Assistant failed for ${partId}:`, err.message);
    res.status(500).json({ error: err.message, part_id: partId });
  }
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
