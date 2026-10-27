// scripts/test_p4_drafts.js — P4 draft generation tests
//
// Test cases:
//   MIR-001: confirmed fitment list (part_number VERIFIED + matches reference)
//   MIR-004: unverified sentence + cracked tab in condition disclosure (after P3 confirms)
//   MIR-006: tested_fault description with up/down-only detail, no "working"
//
// Run: MOCK=1 node scripts/test_p4_drafts.js  (after starting server with MOCK=1)

const BASE = "http://localhost:3000";

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  return r.json();
}

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    process.exitCode = 1;
  }
}

async function testMIR001() {
  console.log("\n=== MIR-001: confirmed fitment list ===");

  // Ingest first to populate the ledger
  await post("/api/parts/MIR-001/ingest", {});

  // Confirm damage rows so G3 doesn't block (cosmetic is PARTIAL from photo)
  await post("/api/parts/MIR-001/confirm", { attribute: "cosmetic_condition", value: "light scuff on cover", lang: "en" });
  await post("/api/parts/MIR-001/confirm", { attribute: "structural_damage", value: "none", lang: "en" });

  const draft = await get("/api/parts/MIR-001/draft");

  assert(!draft.blocked, "draft should NOT be blocked");

  if (draft.draft) {
    const compat = draft.draft.compatibility;
    assert(compat.confirmed_fitment.length > 0, "should have confirmed fitment list");
    if (compat.confirmed_fitment.length > 0) {
      const f = compat.confirmed_fitment[0];
      console.log(`    fitment: ${f.make} ${f.model} ${f.years} ${f.side} (${f.part_number})`);
    }
    assert(compat.unverified_statement === null, "should NOT have unverified statement");

    // G1: tested_ok so "working" is allowed
    assert(draft.draft.condition_disclosure.tested === "tested_ok", "tested should be tested_ok");

    // G6: checklist attached
    assert(!!draft.draft.checklist?.checklist_version, "should have checklist version");
    assert(!!draft.draft.checklist?.banner, "should have checklist banner");

    console.log(`    title: ${draft.draft.title}`);
    console.log(`    checklist_version: ${draft.draft.checklist.checklist_version}`);
  }
}

async function testMIR004() {
  console.log("\n=== MIR-004: unverified sentence + cracked tab ===");

  // Ingest
  await post("/api/parts/MIR-004/ingest", {});

  // Confirm the P3 attributes so damage is VERIFIED
  await post("/api/parts/MIR-004/confirm", { attribute: "donor_year", value: "2018", lang: "en" });
  await post("/api/parts/MIR-004/confirm", { attribute: "structural_damage", value: "cracked lower mounting tab", lang: "en" });
  await post("/api/parts/MIR-004/confirm", { attribute: "tested", value: "untested", lang: "en" });
  await post("/api/parts/MIR-004/confirm", { attribute: "cosmetic_condition", value: "none", lang: "en" });

  const draft = await get("/api/parts/MIR-004/draft");

  assert(!draft.blocked, "draft should NOT be blocked (damage rows are VERIFIED)");

  if (draft.draft) {
    const compat = draft.draft.compatibility;
    // part_number is PARTIAL (87910-02F??) → unverified
    assert(compat.confirmed_fitment.length === 0, "should NOT have confirmed fitment (PN is PARTIAL)");
    assert(!!compat.unverified_statement, "should have unverified statement");

    if (compat.unverified_statement) {
      console.log(`    unverified: "${compat.unverified_statement}"`);
      assert(
        compat.unverified_statement.includes("Fitment: unverified"),
        "unverified sentence should match spec wording",
      );
      assert(
        compat.unverified_statement.includes("Toyota Corolla 2018"),
        "should mention donor vehicle",
      );
    }

    // Condition disclosure should have the cracked tab
    const cd = draft.draft.condition_disclosure;
    assert(
      String(cd.structural).toLowerCase().includes("crack"),
      "structural condition should mention crack",
    );
    console.log(`    structural: ${cd.structural}`);
    console.log(`    tested: ${cd.tested}`);

    // G1: tested is untested → no "working" in description
    assert(
      !/working/i.test(draft.draft.description_markdown),
      "description should NOT contain 'working' (tested=untested)",
    );

    console.log(`    title: ${draft.draft.title}`);
  }
}

async function testMIR006() {
  console.log("\n=== MIR-006: tested_fault, up/down-only detail, no 'working' ===");

  // Ingest
  await post("/api/parts/MIR-006/ingest", {});

  // Confirm damage rows (both "none" from photo, need VERIFIED)
  await post("/api/parts/MIR-006/confirm", { attribute: "cosmetic_condition", value: "none", lang: "en" });
  await post("/api/parts/MIR-006/confirm", { attribute: "structural_damage", value: "none", lang: "en" });

  const draft = await get("/api/parts/MIR-006/draft");

  assert(!draft.blocked, "draft should NOT be blocked");

  if (draft.draft) {
    const cd = draft.draft.condition_disclosure;
    assert(cd.tested === "tested_fault", "tested should be tested_fault");
    console.log(`    tested: ${cd.tested}`);

    // Description should mention the fault detail (up/down only, left/right dead)
    const desc = draft.draft.description_markdown;
    console.log(`    description excerpt: ${desc.substring(0, 200)}...`);
    assert(
      /up\/down/i.test(desc),
      "description should mention 'up/down' detail",
    );
    assert(
      /left\/right/i.test(desc) || /dead/i.test(desc),
      "description should mention left/right dead",
    );

    // G1: tested_fault → NO "working" or "functional" or "tested OK"
    assert(
      !/working/i.test(desc),
      "description should NOT contain 'working' (tested=tested_fault)",
    );
    assert(
      !/functional/i.test(desc),
      "description should NOT contain 'functional'",
    );
    assert(
      !/tested\s*ok/i.test(desc),
      "description should NOT contain 'tested OK'",
    );

    // Fitment: part_number is 96301-3TH0A, VERIFIED → should match reference
    const compat = draft.draft.compatibility;
    assert(compat.confirmed_fitment.length > 0, "should have confirmed fitment (PN VERIFIED + matches)");
    if (compat.confirmed_fitment.length > 0) {
      const f = compat.confirmed_fitment[0];
      console.log(`    fitment: ${f.make} ${f.model} ${f.years} ${f.side}`);
    }

    console.log(`    title: ${draft.draft.title}`);
  }
}

async function main() {
  console.log("=== P4 Draft Generation Tests ===");

  await testMIR001();
  await testMIR004();
  await testMIR006();

  // Also test G4: AIR-020 (excluded) should block draft
  console.log("\n=== AIR-020: excluded → no draft (G4) ===");
  const airDraft = await get("/api/parts/AIR-020/draft");
  assert(airDraft.blocked, "AIR-020 draft should be blocked (G4 exclusion)");
  assert(airDraft.guardrail === "G4", "should be blocked by G4");
  if (airDraft.reason) console.log(`    reason: ${airDraft.reason}`);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
