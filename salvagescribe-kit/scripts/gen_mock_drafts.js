// scripts/gen_mock_drafts.js — generates data/mock_responses/draft_<part_id>.json
// for all parts, derived from the ingest mock + answer key.
//
// These are RAW model responses (before guardrails). Guardrails post-process
// them at runtime: G1 strips "working/functional", G2 gates fitment, etc.
//
// Run: node scripts/gen_mock_drafts.js

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const MOCK_DIR = join(DATA, "mock_responses");

mkdirSync(MOCK_DIR, { recursive: true });

const answerKey = JSON.parse(readFileSync(join(DATA, "answer_key.json"), "utf8"));

function answerFor(partId) {
  return answerKey.find((a) => a.part_id === partId) ?? {};
}

function buildDraft(partId) {
  const gt = answerFor(partId).ground_truth ?? {};

  // If this is an excluded part, no draft is generated (G4 handles it).
  // But we still produce a raw response so the mock loader is happy.
  const make = gt.make ?? "Unknown";
  const model = gt.model ?? "Unknown";
  const year = gt.year ?? "Unknown";
  const side = gt.side || "N/A";
  const pn = gt.pn || null;
  const features = gt.features || "";
  const tested = gt.tested || "untested";
  const cosmetic = gt.cosmetic || "none";
  const structural = gt.structural || "none";
  const glass = gt.glass || "clear";
  const comps = gt.comps || "";

  // Title: ≤ 80 chars, contains make, model, part type, side, "Used"
  const title = `Used ${make} ${model} Side-View Mirror ${side} ${year}`.slice(0, 80);

  // Category suggestion
  const category = "Vehicle Parts & Accessories > Car Parts > Exterior > Mirrors";

  // Item specifics
  const itemSpecifics = {
    make,
    model,
    year,
    side: side || "N/A",
    part_number: pn,
    manufacturer: "OEM",
    features,
    colour: null,
  };

  // Condition disclosure
  const conditionDisclosure = {
    cosmetic,
    structural,
    glass,
    tested,
  };

  // Description markdown — this is the RAW model text.
  // It may contain "working/functional" which G1 will strip if tested != tested_ok.
  let desc = `## ${title}\n\n`;

  desc += `**Part Number:** ${pn ? pn : "Not available / partially legible"}\n`;
  desc += `**Side:** ${side}\n`;
  desc += `**Features:** ${features}\n\n`;

  desc += `### Condition\n`;
  desc += `- Cosmetic: ${cosmetic}\n`;
  desc += `- Structural: ${structural}\n`;
  desc += `- Glass: ${glass}\n`;
  desc += `- Electrical test: ${tested}\n\n`;

  desc += `### What's Included\n${comps}\n\n`;

  // Tested description — this is where G1 matters
  if (tested === "tested_ok") {
    // Model might say "working" — G1 allows it here since tested===tested_ok
    desc += `### Test Status\nBench tested OK — all motor functions working (up/down/left/right), heating element functional.\n\n`;
  } else if (tested === "tested_fault") {
    // For MIR-006: motor adjusts up/down only, left/right dead
    desc += `### Test Status\nTested with fault: motor adjusts up/down only, left/right adjustment dead. Sold as faulty.\n\n`;
  } else {
    desc += `### Test Status\nElectrical test not performed — sold as untested.\n\n`;
  }

  // Damage disclosure
  if (structural && structural !== "none") {
    desc += `### Damage Disclosure\n${structural}\n\n`;
  }

  desc += `### Buyer Note\nConfirm fitment by part number before purchase. Donor vehicle: ${make} ${model} ${year}.\n`;

  // Compatibility — model leaves it empty; guardrails fill it
  const compatibility = {
    donor_vehicle_recorded: `${make} ${model} ${year}`,
    confirmed_fitment: [],
    unverified_statement: null,
  };

  return {
    title,
    description_markdown: desc,
    category_suggestion: category,
    item_specifics: itemSpecifics,
    condition_disclosure: conditionDisclosure,
    compatibility,
  };
}

// ── Generate for all 20 parts ──────────────────────────────────────────────
const partIds = answerKey.map((a) => a.part_id);

for (const partId of partIds) {
  const draft = buildDraft(partId);
  const outPath = join(MOCK_DIR, `draft_${partId}.json`);
  writeFileSync(outPath, JSON.stringify(draft, null, 2) + "\n", "utf8");
  console.log(`wrote ${outPath}`);
}

console.log(`\nGenerated ${partIds.length} mock draft responses.`);
