// src/loader.js — reads the test-pack CSV/JSON files and builds an initial
// Evidence Ledger per part WITHOUT calling any model.
//
// Sources consumed:
//   data/inventory.csv        → spreadsheet description → make/model/year/side candidates
//   data/donor_vehicles.csv   → donor_* candidates (source=dismantling_note)
//   data/inventory_notes.json → stored raw (en/ar) for the ingest step
//   data/photo_manifest.json  → photo list + "shows" text stored raw
//
// Any part whose description or notes contain an exclusion-list word gets
// exclusion_flag=true and classification=SPECIALIST_REVIEW immediately.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  createLedger,
  setCandidate,
  resolveAll,
  ledgerToJSON,
} from "./ledger.js";

const __dirname = join(process.cwd(), "lib", "engine");
const DATA_DIR = join(process.cwd(), "data");

// Exclusion list (spec §6 guardrail 4 / checklist rule X-01)
export const EXCLUSION_TERMS = [
  "airbag",
  "battery",
  "seatbelt pretensioner",
  "fuel tank",
  "brake component",
  "brake caliper",
  "brake pad",
  "brake disc",
];

const EXCLUSION_REGEX = new RegExp(
  EXCLUSION_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

function isExcluded(...texts) {
  const hay = texts.filter(Boolean).join(" ");
  return EXCLUSION_REGEX.test(hay);
}

// ── minimal CSV parser (handles quoted fields with commas) ─────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = cells[i] ?? "";
    }
    return obj;
  });
  return { headers, rows };
}

function splitCSVLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur.trim());
  return cells;
}

// ── spreadsheet description → make / model / year / side candidates ────────

const SIDE_RE = /\b(RH|LH|right|left|right hand|left hand)\b/i;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

// Common make names for greedy extraction from a free-text description.
const MAKES = [
  "Land Cruiser", // compound model — handle before "Toyota"
  "Toyota", "Nissan", "Honda", "Hyundai", "Kia", "Mitsubishi", "Lexus",
  "Mazda", "Subaru", "Suzuki", "Ford", "Chevrolet", "BMW", "Mercedes",
  "Audi", "Volkswagen",
];

function parseDescription(desc) {
  const out = {};
  if (!desc) return out;

  // side
  const sideM = desc.match(SIDE_RE);
  if (sideM) {
    const raw = sideM[1].toUpperCase();
    out.side = raw.startsWith("R") || raw === "RIGHT" ? "RH" : "LH";
  }

  // year
  const yearM = desc.match(YEAR_RE);
  if (yearM) {
    out.donor_year = Number(yearM[1]);
  }

  // make (longest match first)
  for (const make of MAKES) {
    if (new RegExp(`\\b${make}\\b`, "i").test(desc)) {
      out.donor_make = make;
      break;
    }
  }

  // model: grab the token(s) right after the make, but stop at known
  // non-model words (mirror, airbag, w/, with, folding, heated, camera,
  // manual, etc.) so we don't capture "Corolla mirror" as the model.
  const STOP_WORDS = new Set([
    "mirror", "mirrors", "airbag", "w", "with", "folding", "heated",
    "signal", "camera", "manual", "power", "used", "good", "works",
    "from", "donor", "side",
  ]);
  if (out.donor_make) {
    const modelRe = new RegExp(
      `\\b${out.donor_make}\\b\\s+([A-Za-z]+(?:\\s+[A-Za-z]+)?)`,
      "i",
    );
    const mm = desc.match(modelRe);
    if (mm) {
      let model = mm[1].trim();
      // "Land Cruiser" is a compound model for Toyota; special-case.
      if (out.donor_make === "Toyota" && /^land/i.test(model)) {
        model = "Land Cruiser";
      } else {
        // strip any trailing stop-word token(s)
        const tokens = model.split(/\s+/);
        while (tokens.length > 1 && STOP_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
          tokens.pop();
        }
        model = tokens.join(" ");
      }
      // If only word left is a stop-word (e.g. "mirror"), don't set model
      if (model && !STOP_WORDS.has(model.toLowerCase())) {
        out.donor_model = model;
      }
    }
  }

  // part_type: every inventory row is a mirror (or airbag) — set explicitly.
  if (/airbag/i.test(desc)) {
    out.part_type = "airbag";
  } else if (/mirror/i.test(desc)) {
    out.part_type = "side-view mirror";
  }

  return out;
}

// ── loadAll(): build initial ledgers for every part in the test pack ───────

export function loadAll(dataDir = DATA_DIR) {
  const inventoryCSV = readFileSync(join(dataDir, "inventory.csv"), "utf8");
  const donorsCSV = readFileSync(join(dataDir, "donor_vehicles.csv"), "utf8");
  const notesJSON = JSON.parse(
    readFileSync(join(dataDir, "inventory_notes.json"), "utf8"),
  );
  const photoManifest = JSON.parse(
    readFileSync(join(dataDir, "photo_manifest.json"), "utf8"),
  );

  const { rows: inventoryRows } = parseCSV(inventoryCSV);
  const { rows: donorRows } = parseCSV(donorsCSV);

  const notesByPart = Object.fromEntries(
    notesJSON.map((n) => [n.part_id, n]),
  );
  const photosByPart = {};
  for (const p of photoManifest) {
    const pid = p.file.split("_")[0];
    (photosByPart[pid] ??= []).push(p);
  }

  const ledgers = [];

  for (const invRow of inventoryRows) {
    const partId = invRow.id;
    if (!partId) continue;

    const ledger = createLedger(partId);
    ledger.spreadsheet_row = invRow;

    // notes stored raw (EN + AR) for the ingest step
    const note = notesByPart[partId] ?? {};
    ledger.notes = {
      en: note.note_en ?? null,
      ar: note.note_ar ?? null,
    };

    // photos stored raw
    ledger.photos = photosByPart[partId] ?? [];

    // --- exclusion check (description + notes) ---
    const excluded = isExcluded(
      invRow.description,
      note.note_en,
      note.note_ar,
    );

    if (excluded) {
      ledger.exclusion_flag = true;
      ledger.classification = "SPECIALIST_REVIEW";
    }

    // --- spreadsheet description → candidates ---
    const parsed = parseDescription(invRow.description);
    const descRef = `inventory.csv row ${inventoryRows.indexOf(invRow) + 1}`;
    for (const [attr, value] of Object.entries(parsed)) {
      setCandidate(ledger, attr, value, "spreadsheet", descRef);
    }

    // asking_price + storage_location from spreadsheet
    if (invRow.price_aed) {
      setCandidate(
        ledger,
        "asking_price",
        invRow.price_aed,
        "spreadsheet",
        descRef,
      );
    }
    if (invRow.location) {
      setCandidate(
        ledger,
        "storage_location",
        invRow.location,
        "spreadsheet",
        descRef,
      );
    }

    // --- donor_vehicles.csv → donor candidates (source=dismantling_note) ---
    const donor = donorRows.find((r) => r.part_id === partId);
    if (donor) {
      const donorRef = `donor_vehicles.csv row ${
        donorRows.indexOf(donor) + 1
      }`;
      if (donor.donor_make) {
        setCandidate(
          ledger,
          "donor_make",
          donor.donor_make,
          "dismantling_note",
          donorRef,
        );
      }
      if (donor.donor_model) {
        setCandidate(
          ledger,
          "donor_model",
          donor.donor_model,
          "dismantling_note",
          donorRef,
        );
      }
      if (donor.donor_year) {
        setCandidate(
          ledger,
          "donor_year",
          Number(donor.donor_year),
          "dismantling_note",
          donorRef,
        );
      }
    }

    // resolve all attributes that have candidates
    resolveAll(ledger);

    ledgers.push(ledger);
  }

  return ledgers;
}

// convenience: load and serialise to JSON-safe objects
export function loadAllJSON(dataDir = DATA_DIR) {
  return loadAll(dataDir).map(ledgerToJSON);
}

// load a single part by id
export function loadPart(partId, dataDir = DATA_DIR) {
  return loadAll(dataDir).find((l) => l.part_id === partId) ?? null;
}
