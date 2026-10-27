// src/guardrails.test.js — unit tests for each guardrail (spec §6)
//
// Run: node --test src/guardrails.test.js
// (or: npm test if package.json has "test": "node --test")

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  g1_stripFunctionalClaims,
  g2_fitmentGate,
  g3_damageBlock,
  g4_exclusionCheck,
  g6_checklistMeta,
  applyGuardrails,
} from "./guardrails.js";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeLedger(overrides = {}) {
  return {
    part_id: "TEST-001",
    classification: null,
    exclusion_flag: false,
    notes: { en: null, ar: null },
    photos: [],
    spreadsheet_row: null,
    ledger: {
      tested: { value: "tested_ok", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-tested" },
      part_number: { value: "87910-02F10", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-part_number" },
      structural_damage: { value: "none", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-structural_damage" },
      cosmetic_condition: { value: "none", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-cosmetic_condition" },
      glass_condition: { value: "clear", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-glass_condition" },
      donor_make: { value: "Toyota", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-donor_make" },
      donor_model: { value: "Corolla", status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-donor_model" },
      donor_year: { value: 2018, status: "VERIFIED", candidates: [], question_id: "Q-TEST-001-donor_year" },
      ...overrides,
    },
  };
}

function makeDraft(overrides = {}) {
  return {
    title: "Used Toyota Corolla Side-View Mirror RH 2018",
    description_markdown: "Mirror is working and functional. Tested OK.",
    category_suggestion: "Vehicle Parts > Mirrors",
    item_specifics: {},
    condition_disclosure: { cosmetic: "none", structural: "none", glass: "clear", tested: "tested_ok" },
    compatibility: {},
    ...overrides,
  };
}

// ── G1: strip functional claims ─────────────────────────────────────────────

test("G1: strips 'working' and 'functional' when tested != tested_ok", () => {
  const ledger = makeLedger({
    tested: { value: "tested_fault", status: "VERIFIED", candidates: [], question_id: "Q-test" },
  });
  const draft = makeDraft({
    description_markdown: "Mirror is working and functional. Tested OK.",
    title: "Working Toyota Mirror",
  });

  const result = g1_stripFunctionalClaims(draft, ledger);
  assert.ok(result.applied, "G1 should have been applied");
  assert.ok(result.stripped.length > 0, "should have stripped banned words");
  assert.ok(!/working/i.test(result.description), "description should not contain 'working'");
  assert.ok(!/functional/i.test(result.description), "description should not contain 'functional'");
  assert.ok(!/tested\s*ok/i.test(result.description), "description should not contain 'tested OK'");
  assert.ok(!/working/i.test(result.title), "title should not contain 'working'");
});

test("G1: does NOT strip when tested === tested_ok", () => {
  const ledger = makeLedger(); // tested_ok by default
  const draft = makeDraft({
    description_markdown: "Mirror is working and functional. Tested OK.",
  });

  const result = g1_stripFunctionalClaims(draft, ledger);
  assert.ok(!result.applied, "G1 should NOT have been applied");
  assert.ok(/working/i.test(result.description), "description should still contain 'working'");
});

test("G1: strips when tested === untested", () => {
  const ledger = makeLedger({
    tested: { value: "untested", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const draft = makeDraft({
    description_markdown: "Mirror is working perfectly.",
  });

  const result = g1_stripFunctionalClaims(draft, ledger);
  assert.ok(result.applied);
  assert.ok(!/working/i.test(result.description));
});

// ── G2: fitment gating ──────────────────────────────────────────────────────

test("G2: returns confirmed fitment when part_number VERIFIED and matches reference", () => {
  const ledger = makeLedger(); // part_number=87910-02F10, VERIFIED
  const result = g2_fitmentGate(ledger);
  assert.ok(result.matched, "should match the compatibility reference");
  assert.equal(result.confirmed_fitment.length, 1);
  assert.equal(result.confirmed_fitment[0].make, "Toyota");
  assert.equal(result.confirmed_fitment[0].model, "Corolla");
  assert.equal(result.confirmed_fitment[0].years, "2014-2019");
  assert.equal(result.confirmed_fitment[0].side, "RH");
  assert.equal(result.unverified_statement, null);
});

test("G2: returns unverified sentence when part_number is PARTIAL", () => {
  const ledger = makeLedger({
    part_number: { value: "87910-02F??", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const result = g2_fitmentGate(ledger);
  assert.ok(!result.matched);
  assert.equal(result.confirmed_fitment.length, 0);
  assert.ok(result.unverified_statement);
  assert.ok(result.unverified_statement.includes("Fitment: unverified"));
  assert.ok(result.unverified_statement.includes("Toyota Corolla 2018"));
  assert.ok(result.unverified_statement.includes("Confirm by part number"));
});

test("G2: returns unverified sentence when part_number is VERIFIED but does not match reference", () => {
  const ledger = makeLedger({
    part_number: { value: "99999-99X99", status: "VERIFIED", candidates: [], question_id: "Q-test" },
  });
  const result = g2_fitmentGate(ledger);
  assert.ok(!result.matched);
  assert.equal(result.confirmed_fitment.length, 0);
  assert.ok(result.unverified_statement.includes("Fitment: unverified"));
});

test("G2: unverified sentence uses the exact spec wording", () => {
  const ledger = makeLedger({
    part_number: { value: null, status: "MISSING", candidates: [], question_id: "Q-test" },
  });
  const result = g2_fitmentGate(ledger);
  // Exact: "Fitment: unverified. Donor vehicle recorded as {make model year}. Confirm by part number before purchase."
  assert.equal(
    result.unverified_statement,
    "Fitment: unverified. Donor vehicle recorded as Toyota Corolla 2018. Confirm by part number before purchase.",
  );
});

// ── G3: damage block ────────────────────────────────────────────────────────

test("G3: blocks when structural_damage is not VERIFIED", () => {
  const ledger = makeLedger({
    structural_damage: { value: "possible crack", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const result = g3_damageBlock(ledger);
  assert.ok(result.blocked);
  assert.equal(result.blocking.length, 1);
  assert.equal(result.blocking[0].attribute, "structural_damage");
});

test("G3: blocks when cosmetic_condition is not VERIFIED", () => {
  const ledger = makeLedger({
    cosmetic_condition: { value: "scratched", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const result = g3_damageBlock(ledger);
  assert.ok(result.blocked);
  assert.equal(result.blocking[0].attribute, "cosmetic_condition");
});

test("G3: does NOT block when both damage rows are VERIFIED (including 'none')", () => {
  const ledger = makeLedger(); // both VERIFIED with "none"
  const result = g3_damageBlock(ledger);
  assert.ok(!result.blocked);
});

// ── G4: exclusion check ─────────────────────────────────────────────────────

test("G4: blocks draft for excluded parts", () => {
  const ledger = makeLedger();
  ledger.exclusion_flag = true;
  ledger.classification = "SPECIALIST_REVIEW";
  const result = g4_exclusionCheck(ledger);
  assert.ok(result.blocked);
  assert.ok(result.reason.includes("SPECIALIST_REVIEW"));
});

test("G4: does NOT block for non-excluded parts", () => {
  const ledger = makeLedger();
  const result = g4_exclusionCheck(ledger);
  assert.ok(!result.blocked);
});

// ── G6: checklist meta ──────────────────────────────────────────────────────

test("G6: returns checklist version and banner", () => {
  const result = g6_checklistMeta();
  assert.ok(result.checklist_version, "should have a checklist_version");
  assert.ok(result.checklist_id, "should have a checklist_id");
  assert.ok(result.banner, "should have a banner");
  assert.ok(/not legal/i.test(result.banner), "banner should contain the disclaimer");
});

// ── applyGuardrails: integration ────────────────────────────────────────────

test("applyGuardrails: returns blocked for excluded parts (G4)", () => {
  const ledger = makeLedger();
  ledger.exclusion_flag = true;
  ledger.classification = "SPECIALIST_REVIEW";
  const draft = makeDraft();
  const result = applyGuardrails(draft, ledger);
  assert.ok(result.blocked);
  assert.equal(result.guardrail, "G4");
  assert.equal(result.draft, null);
});

test("applyGuardrails: returns blocked when damage not VERIFIED (G3)", () => {
  const ledger = makeLedger({
    structural_damage: { value: "crack", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const draft = makeDraft();
  const result = applyGuardrails(draft, ledger);
  assert.ok(result.blocked);
  assert.equal(result.guardrail, "G3");
  assert.equal(result.draft, null);
});

test("applyGuardrails: applies G1 + G2 + G6 for a clean draft", () => {
  const ledger = makeLedger(); // all VERIFIED, tested_ok, part_number matches
  const draft = makeDraft({
    description_markdown: "Mirror is working perfectly.",
  });
  const result = applyGuardrails(draft, ledger);
  assert.ok(!result.blocked);
  assert.ok(result.draft);
  // G1: since tested_ok, "working" is allowed
  assert.ok(/working/i.test(result.draft.description_markdown));
  // G2: fitment should be confirmed
  assert.ok(result.draft.compatibility.confirmed_fitment.length > 0);
  assert.equal(result.draft.compatibility.unverified_statement, null);
  // G6: checklist meta attached
  assert.ok(result.draft.checklist.checklist_version);
  assert.ok(result.draft.checklist.banner);
});

test("applyGuardrails: G1 strips 'working' when tested_fault, G2 unverified for partial PN", () => {
  const ledger = makeLedger({
    tested: { value: "tested_fault", status: "VERIFIED", candidates: [], question_id: "Q-test" },
    part_number: { value: "87910-02F??", status: "PARTIAL", candidates: [], question_id: "Q-test" },
  });
  const draft = makeDraft({
    description_markdown: "Mirror motor is working. Tested OK.",
  });
  const result = applyGuardrails(draft, ledger);
  assert.ok(!result.blocked);
  assert.ok(result.draft);
  // G1: "working" and "tested OK" should be stripped
  assert.ok(!/working/i.test(result.draft.description_markdown));
  assert.ok(!/tested\s*ok/i.test(result.draft.description_markdown));
  // G2: unverified statement
  assert.ok(result.draft.compatibility.unverified_statement);
  assert.equal(result.draft.compatibility.confirmed_fitment.length, 0);
});
