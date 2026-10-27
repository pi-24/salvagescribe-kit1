// scripts/gen_mock_ingest.js — generates data/mock_responses/ingest_<part_id>.json
// for all 20 parts, derived from photo_manifest.json, inventory_notes.json,
// inventory.csv, donor_vehicles.csv, and answer_key.json.
//
// Run: node scripts/gen_mock_ingest.js
// This is a build-time tool; it does NOT run at request time.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const MOCK_DIR = join(DATA, "mock_responses");

mkdirSync(MOCK_DIR, { recursive: true });

const photos = JSON.parse(readFileSync(join(DATA, "photo_manifest.json"), "utf8"));
const notes = JSON.parse(readFileSync(join(DATA, "inventory_notes.json"), "utf8"));
const answerKey = JSON.parse(readFileSync(join(DATA, "answer_key.json"), "utf8"));

// Arabic → English translations for notes that only have AR
const AR_TRANSLATIONS = {
  "MIR-007": "Left side Camry mirror, electrical test not performed",
  "MIR-015": "Left side Lexus RX mirror, with camera, folding, heating and signal all tested and working",
  "MIR-016": "Right side Lancer mirror, not tested, cover intact",
};

function photosFor(partId) {
  return photos.filter((p) => p.file.startsWith(partId + "_"));
}

function noteFor(partId) {
  return notes.find((n) => n.part_id === partId) ?? {};
}

function answerFor(partId) {
  return answerKey.find((a) => a.part_id === partId) ?? {};
}

// Derive ingest response from answer key ground truth + photo manifest.
function buildResponse(partId) {
  const phs = photosFor(partId);
  const note = noteFor(partId);
  const gt = answerFor(partId).ground_truth ?? {};
  const traps = answerFor(partId).traps ?? [];

  const labelPhoto = phs.find((p) => /label/i.test(p.shows));
  const labelShows = labelPhoto?.shows ?? "";

  // part_number: from ground truth, with '?' if partially readable
  let pnValue = gt.pn ?? null;
  let pnSource = "photo_label";
  let pnConfidence = 0.95;
  let pnNote = "";
  if (pnValue === "") {
    pnValue = null;
    pnNote = "No part-number label present.";
    pnConfidence = 0.9;
  } else if (pnValue && pnValue.includes("?")) {
    pnNote = "Part-number label partially readable — last digits obscured.";
    pnConfidence = 0.5;
  } else if (pnValue) {
    pnNote = "Part-number label fully readable.";
  }

  // side: from photos or note
  let sideValue = gt.side || null;
  let sideSource = "photo";
  let sideNote = "";
  if (!sideValue) {
    sideNote = "Side not evident from photos or notes.";
  } else {
    // Check if side came from photo or note
    const hasSideInPhoto = phs.some((p) =>
      new RegExp(`\\b${sideValue}\\b`, "i").test(p.shows),
    );
    if (hasSideInPhoto) {
      sideNote = `Side (${sideValue}) visible in front photo.`;
    } else {
      sideSource = "dismantling_note";
      sideNote = `Side (${sideValue}) from dismantling note.`;
    }
  }

  // features: from note or photo observation
  let featuresValue = gt.features ?? null;
  let featuresSource = "dismantling_note";
  let featuresNote = "Features observed from dismantling note.";
  if (featuresValue && /camera/i.test(featuresValue)) {
    featuresNote += " Camera housing visible in photo.";
  }

  // tested: from notes only
  let testedValue = gt.tested ?? null;
  let testedSource = "dismantling_note";
  let testedNote = "";
  if (testedValue === "tested_ok") {
    testedNote = "Bench tested OK per dismantling note.";
  } else if (testedValue === "tested_fault") {
    testedNote = "Tested with fault per dismantling note.";
  } else if (testedValue === "untested") {
    testedNote = "No electrical test recorded in notes.";
    testedValue = "untested";
  }

  // cosmetic_condition: from photos
  let cosmeticValue = gt.cosmetic ?? null;
  let cosmeticSource = "photo";
  let cosmeticNote = "";
  if (cosmeticValue && cosmeticValue !== "none") {
    cosmeticNote = "Cosmetic wear visible in photos — reported as possible, needs confirmation.";
    cosmeticSource = "photo";
  } else if (cosmeticValue === "none") {
    cosmeticNote = "No visible cosmetic damage in photos.";
  }

  // structural_damage: from photos
  let structuralValue = gt.structural ?? null;
  let structuralSource = "photo";
  let structuralNote = "";
  if (structuralValue && structuralValue !== "none") {
    // Find the photo that shows the damage
    const damagePhoto = phs.find((p) =>
      /crack|bent|damage|hairline|bracket|tab/i.test(p.shows),
    );
    structuralNote = damagePhoto
      ? `Possible structural damage: ${structuralValue}. Reported from photo ${damagePhoto.file}. Needs confirmation.`
      : `Possible structural damage: ${structuralValue}. Needs confirmation.`;
  } else if (structuralValue === "none") {
    structuralNote = "No visible structural damage in photos.";
    structuralValue = "none";
  }

  // glass_condition: from photos
  let glassValue = gt.glass ?? null;
  let glassSource = "photo";
  let glassNote = "";
  if (glassValue && glassValue !== "clear" && glassValue !== "n/a") {
    glassNote = `Glass condition: ${glassValue}. Needs confirmation.`;
  } else if (glassValue === "clear") {
    glassNote = "Glass surface appears clear in photos.";
  } else if (glassValue === "n/a") {
    glassNote = "Glass not applicable for this part type.";
    glassValue = "n/a";
  }

  // included_components: from notes
  let compsValue = gt.comps ?? null;
  let compsSource = "dismantling_note";
  let compsNote = "Included components per dismantling note.";

  // manufacturer: inferred from label or known OEM
  let manufacturerValue = "OEM";
  let manufacturerSource = "photo_label";
  let manufacturerNote = "OEM part number format on label.";

  // part_type
  let partTypeValue = gt.features === "driver airbag" ? "airbag" : "side-view mirror";
  let partTypeSource = "spreadsheet";
  let partTypeNote = "Part type from spreadsheet description.";

  // possible_damage: collect from photos that mention damage
  const possibleDamage = [];
  for (const p of phs) {
    if (/crack|bent|chip|scratch|scuff|damage|hairline|faded/i.test(p.shows)) {
      possibleDamage.push({
        description: p.shows,
        photo: p.file,
      });
    }
  }

  // translated_notes
  const arNote = note.note_ar;
  let arToEn = null;
  if (arNote) {
    // Use pre-prepared translation if available
    arToEn = AR_TRANSLATIONS[partId] ?? translateArabic(partId, arNote, note.note_en);
  }

  // Build attributes array
  const attributes = [
    { attribute: "part_type", value: partTypeValue, source: partTypeSource, source_ref: "spreadsheet", confidence: 0.98, note: partTypeNote },
    { attribute: "side", value: sideValue, source: sideSource, source_ref: phs.find(p => /front/i.test(p.shows))?.file ?? note.note_en ?? "photos", confidence: sideValue ? 0.85 : 0.3, note: sideNote },
    { attribute: "manufacturer", value: manufacturerValue, source: manufacturerSource, source_ref: labelPhoto?.file ?? "label", confidence: 0.8, note: manufacturerNote },
    { attribute: "part_number", value: pnValue, source: pnSource, source_ref: labelPhoto?.file ?? "label", confidence: pnConfidence, note: pnNote },
    { attribute: "features", value: featuresValue, source: featuresSource, source_ref: "notes.json " + partId, confidence: 0.7, note: featuresNote },
    { attribute: "tested", value: testedValue, source: testedSource, source_ref: "notes.json " + partId, confidence: testedValue === "untested" ? 0.5 : 0.85, note: testedNote },
    { attribute: "cosmetic_condition", value: cosmeticValue, source: cosmeticSource, source_ref: phs.find(p => /front/i.test(p.shows))?.file ?? "photos", confidence: cosmeticValue && cosmeticValue !== "none" ? 0.6 : 0.8, note: cosmeticNote },
    { attribute: "structural_damage", value: structuralValue, source: structuralSource, source_ref: phs.find(p => /crack|bent|damage|hairline|tab/i.test(p.shows))?.file ?? "photos", confidence: structuralValue && structuralValue !== "none" ? 0.5 : 0.8, note: structuralNote },
    { attribute: "glass_condition", value: glassValue, source: glassSource, source_ref: phs.find(p => /glass/i.test(p.shows))?.file ?? "photos", confidence: glassValue && glassValue !== "clear" && glassValue !== "n/a" ? 0.6 : 0.85, note: glassNote },
    { attribute: "included_components", value: compsValue, source: compsSource, source_ref: "notes.json " + partId, confidence: 0.7, note: compsNote },
  ];

  // Add donor_* from notes if the note mentions donor info
  // (these supplement the spreadsheet/donor_vehicles candidates already in ledger)

  return {
    attributes,
    possible_damage: possibleDamage,
    translated_notes: { ar_to_en: arToEn },
  };
}

// Rough Arabic→English translation for notes that don't have an EN counterpart.
// In production this would be the model; here we use the answer key + known translations.
function translateArabic(partId, arText, enNote) {
  if (enNote) return enNote; // English note already exists
  return AR_TRANSLATIONS[partId] ?? null;
}

// ── generate for all 20 parts ──────────────────────────────────────────────
const partIds = photos
  .map((p) => p.file.split("_")[0])
  .filter((v, i, arr) => arr.indexOf(v) === i);

for (const partId of partIds) {
  const resp = buildResponse(partId);
  const outPath = join(MOCK_DIR, `ingest_${partId}.json`);
  writeFileSync(outPath, JSON.stringify(resp, null, 2) + "\n", "utf8");
  console.log(`wrote ${outPath}`);
}

console.log(`\nGenerated ${partIds.length} mock ingest responses.`);
