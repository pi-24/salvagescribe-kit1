// src/ingest.js — the ingest pipeline (spec §5 "Ingest / vision").
//
// POST /api/parts/:id/ingest:
//   Inputs: the part's photos (from photo_manifest, or /data/photos when
//   real files exist), the spreadsheet row, and notes (EN + AR).
//   Calls the model via src/llm.js with the ingest system prompt.
//   Feeds the returned attributes into the ledger via setCandidate so
//   resolve() decides status.
//
// In MOCK=1 mode (or when a photo file is missing), the photo_manifest
// "shows" text is used as the image description instead of real pixels.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { callModel } from "./llm.js";
import { setCandidate, resolveAll, ledgerToJSON } from "./ledger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PHOTOS_DIR = join(ROOT, "data", "photos");
const PROMPT_PATH = join(__dirname, "prompts", "ingest.txt");

// Cache the system prompt
let _systemPrompt = null;
function systemPrompt() {
  if (!_systemPrompt) {
    _systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  }
  return _systemPrompt;
}

// JSON schema for the ingest response (spec §5)
const INGEST_SCHEMA = {
  type: "object",
  properties: {
    attributes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          attribute: { type: "string" },
          value: { type: ["string", "null"] },
          source: {
            type: "string",
            enum: [
              "photo_label",
              "photo",
              "dismantling_note",
              "spreadsheet",
              "model_inference",
            ],
          },
          source_ref: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          note: { type: "string" },
        },
        required: [
          "attribute",
          "value",
          "source",
          "source_ref",
          "confidence",
          "note",
        ],
        additionalProperties: false,
      },
    },
    possible_damage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          photo: { type: "string" },
        },
        required: ["description", "photo"],
        additionalProperties: false,
      },
    },
    translated_notes: {
      type: "object",
      properties: {
        ar_to_en: { type: ["string", "null"] },
      },
      required: ["ar_to_en"],
      additionalProperties: false,
    },
  },
  required: ["attributes", "possible_damage", "translated_notes"],
  additionalProperties: false,
};

/**
 * Run ingest for a part.
 * @param {object} ledger — the in-memory ledger object (mutated in place)
 * @param {object} opts
 * @param {boolean} [opts.useMock] — force mock mode
 * @returns {Promise<object>} — { model_response, ledger_json }
 */
export async function ingestPart(ledger, opts = {}) {
  const partId = ledger.part_id;

  // Build the image inputs.  Use real photo files when available; otherwise
  // fall back to the "shows" text from photo_manifest as the description.
  const images = (ledger.photos ?? []).map((p) => {
    if (p.url) return { url: p.url, description: p.shows };
    const safeName = /^[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(p.file || "");
    const realPath = safeName ? join(PHOTOS_DIR, p.file) : null;
    if (realPath && existsSync(realPath)) {
      const mime = /\.png$/i.test(p.file) ? "png" : /\.webp$/i.test(p.file) ? "webp" : "jpeg";
      return { url: `data:image/${mime};base64,${readFileSync(realPath).toString("base64")}`, description: p.shows };
    }
    return { description: `[Demo manifest, not actual pixels: ${p.file}] ${p.shows || "No photo available"}` };
  });

  // Build the user prompt with spreadsheet row + notes
  const userPrompt = [
    `Part ID: ${partId}`,
    "",
    `Spreadsheet row:`,
    JSON.stringify(ledger.spreadsheet_row, null, 2),
    "",
    `Dismantling notes:`,
    `  English: ${ledger.notes.en ?? "(none)"}`,
    `  Arabic: ${ledger.notes.ar ?? "(none)"}`,
    "",
    `Photos (${images.length}):`,
    ...images.map(
      (img, i) =>
        `  ${i + 1}. ${img.description ?? img.url}`,
    ),
  ].join("\n");

  const mockKey = `ingest_${partId}`;

  const modelResponse = await callModel({
    system: systemPrompt(),
    user: userPrompt,
    images,
    jsonSchema: INGEST_SCHEMA,
    mockKey,
  });

  // Feed results into the ledger via setCandidate so resolve() decides status.
  // The model returns attributes with source + source_ref; we add them as
  // candidates alongside the spreadsheet/donor candidates already present.
  for (const attr of modelResponse.attributes ?? []) {
    if (attr.value === null || attr.value === undefined || attr.value === "") {
      // null value → mark as MISSING (don't add a candidate)
      continue;
    }
    if (!ledger._attr_order.includes(attr.attribute)) continue;
    const allowed = ["spreadsheet", "dismantling_note", "photo", "photo_label", "model_inference"];
    if (!allowed.includes(attr.source)) throw new Error("AI returned an untrusted evidence source");
    setCandidate(ledger, attr.attribute, attr.value, attr.source, attr.source_ref);
    const candidate = ledger.ledger[attr.attribute].candidates.at(-1);
    if (candidate) { candidate.confidence = attr.confidence; candidate.note = attr.note; }
  }

  // Store translated note on the ledger for later use
  if (modelResponse.translated_notes?.ar_to_en) {
    ledger.notes.ar_to_en = modelResponse.translated_notes.ar_to_en;
  }

  // Store possible damage for the questions/draft steps
  ledger.possible_damage = modelResponse.possible_damage ?? [];

  // Re-resolve all attributes with the new candidates
  resolveAll(ledger);

  return {
    model_response: modelResponse,
    ledger_json: ledgerToJSON(ledger),
  };
}
