// src/readiness.test.js — unit tests for readiness classification (spec §7)
//
// Run: node --test src/readiness.test.js

import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateReadiness, approvePart } from "./readiness.js";
import { createLedger, setCandidate, resolveAll, STATUS } from "./ledger.js";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeReadyLedger(partId = "TEST-READY") {
  const l = createLedger(partId);
  // part_type from spreadsheet
  setCandidate(l, "part_type", "side-view mirror", "spreadsheet", "test");
  // side from photo (PARTIAL but present — acceptable)
  setCandidate(l, "side", "RH", "photo", "test");
  // part_number from fully-readable photo_label → VERIFIED
  setCandidate(l, "part_number", "87910-02F10", "photo_label", "test");
  // manufacturer from photo_label
  setCandidate(l, "manufacturer", "OEM", "photo_label", "test");
  // donor vehicle from spreadsheet + dismantling_note (both agree → PARTIAL, non-conflicting)
  setCandidate(l, "donor_make", "Toyota", "spreadsheet", "test");
  setCandidate(l, "donor_model", "Corolla", "spreadsheet", "test");
  setCandidate(l, "donor_year", 2018, "spreadsheet", "test");
  setCandidate(l, "donor_make", "Toyota", "dismantling_note", "test");
  setCandidate(l, "donor_model", "Corolla", "dismantling_note", "test");
  setCandidate(l, "donor_year", 2018, "dismantling_note", "test");
  // features from dismantling_note
  setCandidate(l, "features", "power, heated", "dismantling_note", "test");
  // tested_ok from dismantling_note
  setCandidate(l, "tested", "tested_ok", "dismantling_note", "test");
  // cosmetic from photo
  setCandidate(l, "cosmetic_condition", "none", "photo", "test");
  // structural from photo
  setCandidate(l, "structural_damage", "none", "photo", "test");
  // glass from photo
  setCandidate(l, "glass_condition", "clear", "photo", "test");
  // components from dismantling_note
  setCandidate(l, "included_components", "cover, glass, harness", "dismantling_note", "test");
  // photos
  l.photos = [
    { file: "test_1.jpg", shows: "front" },
    { file: "test_2.jpg", shows: "back" },
    { file: "test_3.jpg", shows: "glass" },
    { file: "test_4.jpg", shows: "label" },
  ];
  resolveAll(l);
  return l;
}

// ── Classification tests ───────────────────────────────────────────────────

test("READY_FOR_REVIEW: all critical attributes verified/resolved", () => {
  const l = makeReadyLedger();
  const result = evaluateReadiness(l);
  assert.equal(result.class, "READY_FOR_REVIEW");
  assert.equal(result.blocking_rule, null);
  // Shipping rules should be NA
  const s01 = result.rules.find((r) => r.id === "S-01");
  assert.equal(s01.result, "NA");
});

test("SPECIALIST_REVIEW: excluded part (airbag)", () => {
  const l = makeReadyLedger("AIR-TEST");
  l.exclusion_flag = true;
  l.classification = "SPECIALIST_REVIEW";
  const result = evaluateReadiness(l);
  assert.equal(result.class, "SPECIALIST_REVIEW");
  assert.equal(result.blocking_rule, "X-01");
  const x01 = result.rules.find((r) => r.id === "X-01");
  assert.equal(x01.result, "FAIL");
});

test("INFO_MISSING: partial part number", () => {
  const l = makeReadyLedger();
  // Replace part_number with a partial one
  l.ledger.part_number.candidates = [];
  setCandidate(l, "part_number", "87910-02F??", "photo_label", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "INFO_MISSING");
  // L-03 should fail
  const l03 = result.rules.find((r) => r.id === "L-03");
  assert.equal(l03.result, "FAIL");
});

test("INFO_MISSING: missing part number", () => {
  const l = makeReadyLedger();
  l.ledger.part_number.candidates = [];
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "INFO_MISSING");
  const l03 = result.rules.find((r) => r.id === "L-03");
  assert.equal(l03.result, "FAIL");
});

test("INFO_MISSING: untested (tested value = untested)", () => {
  const l = makeReadyLedger();
  l.ledger.tested.candidates = [];
  setCandidate(l, "tested", "untested", "dismantling_note", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "INFO_MISSING");
  const l07 = result.rules.find((r) => r.id === "L-07");
  assert.equal(l07.result, "FAIL");
});

test("INFO_MISSING: donor year conflict", () => {
  const l = makeReadyLedger();
  // Add a conflicting year from spreadsheet
  l.ledger.donor_year.candidates = [];
  setCandidate(l, "donor_year", 2017, "spreadsheet", "test");
  setCandidate(l, "donor_year", 2018, "dismantling_note", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "INFO_MISSING");
  const l04 = result.rules.find((r) => r.id === "L-04");
  assert.equal(l04.result, "FAIL");
  assert.ok(l04.detail.includes("conflict"));
});

test("INFO_MISSING: missing side", () => {
  const l = makeReadyLedger();
  l.ledger.side.candidates = [];
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "INFO_MISSING");
  const l02 = result.rules.find((r) => r.id === "L-02");
  assert.equal(l02.result, "FAIL");
});

test("READY_FOR_REVIEW: tested_fault is acceptable", () => {
  const l = makeReadyLedger();
  l.ledger.tested.candidates = [];
  setCandidate(l, "tested", "tested_fault", "dismantling_note", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "READY_FOR_REVIEW");
  const l07 = result.rules.find((r) => r.id === "L-07");
  assert.equal(l07.result, "PASS");
});

test("INFO_MISSING: hidden structural damage from photo (not VERIFIED)", () => {
  const l = makeReadyLedger();
  // structural_damage from photo (PARTIAL) with value != "none"
  l.ledger.structural_damage.candidates = [];
  setCandidate(l, "structural_damage", "cracked mounting tab", "photo", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  const l06 = result.rules.find((r) => r.id === "L-06");
  assert.equal(l06.result, "FAIL", "L-06 should fail for unverified structural damage");
  assert.equal(result.class, "INFO_MISSING");
});

test("READY_FOR_REVIEW: cosmetic scuff from photo (PARTIAL) is acceptable", () => {
  const l = makeReadyLedger();
  // cosmetic_condition from photo (PARTIAL) with a non-"none" value — this is
  // a condition note, not a hidden-damage trap.
  l.ledger.cosmetic_condition.candidates = [];
  setCandidate(l, "cosmetic_condition", "light scuff on cover", "photo", "test");
  resolveAll(l);
  const result = evaluateReadiness(l);
  assert.equal(result.class, "READY_FOR_REVIEW");
  const l06 = result.rules.find((r) => r.id === "L-06");
  assert.equal(l06.result, "PASS");
});

// ── Actions tests ──────────────────────────────────────────────────────────

test("actions: sorted by P3 priority order", () => {
  const l = makeReadyLedger();
  // Make multiple rules fail: partial PN + untested
  l.ledger.part_number.candidates = [];
  setCandidate(l, "part_number", "87910-0????", "photo_label", "test");
  l.ledger.tested.candidates = [];
  setCandidate(l, "tested", "untested", "dismantling_note", "test");
  resolveAll(l);

  const result = evaluateReadiness(l);
  assert.ok(result.actions.length >= 2);
  // part_number (priority 1) should come before tested (priority 5)
  const pnAction = result.actions.findIndex((a) => a.rule_id === "L-03");
  const testedAction = result.actions.findIndex((a) => a.rule_id === "L-07");
  assert.ok(pnAction < testedAction, "part_number action should come before tested action");
});

test("actions: includes rule_id and text", () => {
  const l = makeReadyLedger();
  l.ledger.part_number.candidates = [];
  setCandidate(l, "part_number", "87910-0????", "photo_label", "test");
  resolveAll(l);

  const result = evaluateReadiness(l);
  assert.ok(result.actions.length > 0);
  const action = result.actions[0];
  assert.ok(action.rule_id, "action should have rule_id");
  assert.ok(action.text, "action should have text");
  assert.ok(action.question_id, "action should have question_id");
});

// ── Checklist meta tests ───────────────────────────────────────────────────

test("returns checklist_version and banner", () => {
  const l = makeReadyLedger();
  const result = evaluateReadiness(l);
  assert.ok(result.checklist_version, "should have checklist_version");
  assert.ok(result.checklist_id, "should have checklist_id");
  assert.ok(result.banner, "should have banner");
});

test("rules array contains all 22 rules", () => {
  const l = makeReadyLedger();
  const result = evaluateReadiness(l);
  assert.equal(result.rules.length, 22);
  const ids = result.rules.map((r) => r.id);
  assert.ok(ids.includes("X-01"));
  assert.ok(ids.includes("L-01"));
  assert.ok(ids.includes("L-11"));
  assert.ok(ids.includes("S-01"));
  assert.ok(ids.includes("S-07"));
  assert.ok(ids.includes("T-01"));
  assert.ok(ids.includes("T-03"));
});

// ── Approval gate (T-03) tests ─────────────────────────────────────────────

test("approve: succeeds when READY_FOR_REVIEW", () => {
  const l = makeReadyLedger();
  const result = approvePart(l);
  assert.ok(result.approved);
  assert.ok(result.approved_at);
});

test("approve: fails when INFO_MISSING", () => {
  const l = makeReadyLedger();
  l.ledger.part_number.candidates = [];
  setCandidate(l, "part_number", "87910-0????", "photo_label", "test");
  resolveAll(l);
  const result = approvePart(l);
  assert.ok(!result.approved);
  assert.ok(result.reason.includes("INFO_MISSING"));
});

test("approve: fails when SPECIALIST_REVIEW", () => {
  const l = makeReadyLedger("AIR-TEST");
  l.exclusion_flag = true;
  l.classification = "SPECIALIST_REVIEW";
  const result = approvePart(l);
  assert.ok(!result.approved);
  assert.ok(result.reason.includes("SPECIALIST_REVIEW"));
});
