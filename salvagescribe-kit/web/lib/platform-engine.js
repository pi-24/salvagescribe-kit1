import { createLedger, resolveAll, setCandidate, REQUIRED_ATTRS, OPTIONAL_ATTRS } from "./engine/ledger.js";
import { confirmAnswer } from "./engine/questions.js";
import { evaluateReadiness } from "./engine/readiness.js";
import { g2_fitmentGate } from "./engine/guardrails.js";

export const CHECKLIST_VERSION = "UAE-UK-operations-2.0";
export const UNVERIFIED = "Unverified / Buyer to Verify";
const ATTRS = [...REQUIRED_ATTRS, ...OPTIONAL_ATTRS];
const EXCLUDED = /airbag|pretensioner|battery|fuel tank|brake|وسادة هوائية|بطارية/i;
export const value = (l, key) => l.ledger[key]?.value;
export const verified = (l, key) => l.ledger[key]?.status === "VERIFIED" && value(l, key) != null;

export function decodeLedger(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  if (!data || typeof data.part_id !== "string" || !data.ledger || Array.isArray(data.ledger)) throw new Error("Invalid stored ledger");
  const base = createLedger(data.part_id);
  return structuredClone({ ...base, ...data, ledger: { ...base.ledger, ...data.ledger }, _attr_order: base._attr_order });
}

export function validateAnswer(attr, input) {
  if (!ATTRS.includes(attr)) throw new Error("Unknown attribute");
  if (!["string", "number"].includes(typeof input)) throw new Error("Enter a text or numeric value");
  const text = String(input).trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  if (!text || text.length > 1000 || /^other$/i.test(text)) throw new Error("Enter the actual verified value");
  if (attr === "donor_year" && (!/^\d{4}$/.test(text) || +text < 1900 || +text > new Date().getFullYear() + 1)) throw new Error("Enter a valid donor year");
  if (attr === "part_number" && (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/.test(text) || /unknown|unreadable/i.test(text))) throw new Error("A full readable identifier is required; leave unreadable identifiers unresolved");
  if (attr === "side" && !/^(LH|RH|left|right|يسار|يمين|يسرى|يمنى)$/i.test(text)) throw new Error("Choose LH or RH");
  if (attr === "tested" && !/^(tested_ok|tested_fault|untested)$/.test(text)) throw new Error("Choose a recorded testing status");
  if (["packaged_weight_kg", "asking_price"].includes(attr) && (!Number.isFinite(+text) || +text <= 0)) throw new Error("Enter a positive number");
  if (attr === "packaged_dimensions_cm" && !/^\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?$/i.test(text)) throw new Error("Use length x width x height in cm");
  if (attr === "packaged_dimensions_cm" && text.split(/[x×]/i).some((n) => +n <= 0)) throw new Error("Dimensions must be positive");
  return text;
}

export function correctLedger(input, changes, lang = "en") {
  const l = decodeLedger(input);
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) throw new Error("Provide at least one correction");
  const validated = Object.entries(changes).map(([a, v]) => [a, validateAnswer(a, v)]);
  for (const [a, v] of validated) confirmAnswer(l, a, v, lang);
  l.approval = null;
  l.exclusion_flag = Boolean(l.exclusion_flag || EXCLUDED.test([value(l, "part_type"), l.spreadsheet_row?.description].join(" ")));
  return l;
}

export function createPart(input) {
  const id = String(input.part_id || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(id)) throw new Error("Part ID must be 2–40 letters, numbers or hyphens");
  const description = String(input.description || "").trim();
  if (!description || description.length > 200) throw new Error("Enter a description up to 200 characters");
  const l = createLedger(id);
  l.spreadsheet_row = { id, description, price_aed: String(input.price_aed || ""), location: String(input.location || "") };
  l.notes = { en: String(input.note_en || "").slice(0, 5000), ar: String(input.note_ar || "").slice(0, 5000) };
  l.photos = [];
  for (const a of ATTRS) if (input[a] != null && input[a] !== "") setCandidate(l, a, input[a], "spreadsheet", "Seller intake form");
  if (input.price_aed) setCandidate(l, "asking_price", validateAnswer("asking_price", input.price_aed), "spreadsheet", "Seller intake form");
  if (input.location) setCandidate(l, "storage_location", String(input.location), "spreadsheet", "Seller intake form");
  l.exclusion_flag = EXCLUDED.test(`${description} ${l.notes.en} ${l.notes.ar}`);
  l.ingested = false;
  return resolveAll(l);
}

export function makeDraft(l) {
  const part = value(l, "part_type") || "Part";
  const donor = [value(l, "donor_make"), value(l, "donor_model"), value(l, "donor_year")].filter(Boolean).join(" ") || "Not confirmed";
  const pn = verified(l, "part_number") ? value(l, "part_number") : UNVERIFIED;
  const tested = verified(l, "tested") ? value(l, "tested") : "Testing not confirmed";
  const title = ["Used", donor, part, value(l, "side")].filter(Boolean).join(" ").slice(0, 80);
  const damage = value(l, "structural_damage") || "Not confirmed";
  const fitment = g2_fitmentGate(l);
  const compatibility = {
    donor_vehicle_recorded: donor,
    confirmed_fitment: fitment.confirmed_fitment.filter((r) => !/synthetic|mock|demo/i.test(r.source_type || "")),
    unverified_statement: UNVERIFIED + ". Match the full part number and confirm with the buyer. Donor identity alone is not broader fitment evidence.",
  };
  return {
    title,
    description_markdown: `Used ${part}. Recorded donor: ${donor}.\nPart number: ${pn}. Side: ${value(l, "side") || UNVERIFIED}.\nCosmetic condition: ${value(l, "cosmetic_condition") || "Not confirmed"}.\nStructural condition: ${damage}.\nGlass: ${value(l, "glass_condition") || "Not confirmed"}.\nTesting: ${tested}.\nIncluded components: ${value(l, "included_components") || "Not confirmed"}.\nCompatibility: ${UNVERIFIED}. Confirm by part number before purchase.`,
    category_suggestion: /mirror/i.test(part) ? "eBay Motors > Parts & Accessories > Exterior Parts > Mirrors (suggested)" : "eBay Motors > Parts & Accessories (seller to select category)",
    item_specifics: { make: value(l, "donor_make"), model: value(l, "donor_model"), year: value(l, "donor_year"), side: value(l, "side"), part_number: pn, manufacturer: value(l, "manufacturer") === "OEM" && !verified(l, "part_number") ? UNVERIFIED : value(l, "manufacturer"), features: value(l, "features") },
    condition_disclosure: { cosmetic: value(l, "cosmetic_condition"), structural: damage, glass: value(l, "glass_condition"), tested },
    compatibility, status: "draft", approved: false,
  };
}

export function draftIssues(l, draft) {
  if (!draft) return ["Generate a listing draft first"];
  const issues = [];
  const text = `${draft.title || ""}\n${draft.description_markdown || ""}`;
  if (!draft.title?.trim() || draft.title.length > 80) issues.push("Title must contain 1–80 characters");
  if (!draft.description_markdown?.trim() || draft.description_markdown.length > 12000) issues.push("Description must contain 1–12000 characters");
  if (/genuine|authentic|certified|guaranteed|fits all|customs cleared|zero risk/i.test(text)) issues.push("Remove unsupported certification or guarantee claims");
  if (/\boem\b/i.test(text) && !verified(l, "part_number")) issues.push("OEM claims require a verified, readable part number");
  if (/\b(working|functional|tested[ -]?ok|bench[ -]?tested|works perfectly)\b/i.test(text) && !(verified(l, "tested") && value(l, "tested") === "tested_ok")) issues.push("Functionality claims require seller-confirmed testing");
  if (!text.includes(UNVERIFIED)) issues.push(`Keep the compatibility disclosure: ${UNVERIFIED}`);
  for (const a of ["structural_damage", "cosmetic_condition", "glass_condition"]) {
    const v = value(l, a);
    if (v && !/^(none|intact|clear|good)$/i.test(String(v)) && !text.toLowerCase().includes(String(v).toLowerCase())) issues.push(`Description must retain the recorded ${a.replaceAll("_", " ")}`);
  }
  const year = value(l, "donor_year");
  if (year && [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].some((m) => +m[0] !== +year)) issues.push("Do not add unverified donor years or compatibility ranges");
  return issues;
}

export function readiness(l, draft = null) {
  l.exclusion_flag = Boolean(l.exclusion_flag || EXCLUDED.test(String(value(l, "part_type") || "")));
  const base = evaluateReadiness(l);
  const rules = [...base.rules.filter((r) => !r.id.startsWith("T-") && !["S-01", "S-02"].includes(r.id))];
  for (const a of ["part_type", "side", "part_number", "donor_make", "donor_model", "donor_year", "cosmetic_condition", "structural_damage", "glass_condition", "tested", "included_components", "packaged_dimensions_cm", "packaged_weight_kg"]) {
    rules.push({ id: `V-${a}`, result: verified(l, a) ? "PASS" : "FAIL", detail: `${a.replaceAll("_", " ")}: ${verified(l, a) ? "confirmed" : "seller confirmation required"}`, attribute: a });
  }
  const issues = draft ? draftIssues(l, draft) : [];
  rules.push({ id: "D-01", result: draft ? issues.length ? "FAIL" : "PASS" : "NA", detail: draft ? issues.join("; ") || "Draft text passes operational checks" : "Draft not generated" });
  const classification = l.exclusion_flag ? "SPECIALIST_REVIEW" : rules.some((r) => r.result === "FAIL") ? "INFO_MISSING" : "READY_FOR_REVIEW";
  l.classification = classification;
  return { ...base, class: classification, checklist_version: CHECKLIST_VERSION, rules, actions: rules.filter((r) => r.result === "FAIL").map((r) => ({ ...r, action: r.detail })), banner: "Internal operational checklist only. Not certification, legal advice or shipping clearance." };
}
