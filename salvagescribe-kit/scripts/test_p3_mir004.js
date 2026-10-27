// scripts/test_p3_mir004.js — P3 test for MIR-004
// Run: MOCK=1 node scripts/test_p3_mir004.js
// (or: node scripts/test_p3_mir004.js after starting server separately)
//
// Flow:
// 1. POST /api/parts/MIR-004/ingest (MOCK mode)
// 2. GET /api/parts/MIR-004/questions?lang=en
// 3. POST confirm donor_year=2018
// 4. POST confirm structural_damage="cracked lower mounting tab"
// 5. POST confirm tested=untested
// 6. GET questions again → verify only part_number remains open

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

function statusSummary(ledger) {
  const rows = Object.entries(ledger.ledger);
  const open = rows.filter(([, r]) => r.status !== "VERIFIED");
  const verified = rows.filter(([, r]) => r.status === "VERIFIED");
  return {
    total: rows.length,
    verified: verified.length,
    open: open.length,
    openAttrs: open.map(([a, r]) => `${a}=${r.status}`),
    verifiedAttrs: verified.map(([a]) => a),
  };
}

async function main() {
  console.log("=== P3 Test: MIR-004 ===\n");

  // 1. Ingest
  console.log("1. POST /api/parts/MIR-004/ingest");
  const ingest = await post("/api/parts/MIR-004/ingest", {});
  const afterIngest = ingest.ledger_json;
  console.log("   After ingest:", statusSummary(afterIngest));
  console.log();

  // 2. Questions (EN)
  console.log("2. GET /api/parts/MIR-004/questions?lang=en");
  const qs = await get("/api/parts/MIR-004/questions?lang=en");
  console.log(`   ${qs.questions.length} questions:`);
  for (const q of qs.questions) {
    console.log(`   - [${q.attribute}] ${q.text}`);
    if (q.options) console.log(`     options: ${q.options.join(", ")}`);
  }
  console.log();

  // 3. Confirm donor_year=2018
  console.log("3. POST confirm donor_year=2018");
  const c1 = await post("/api/parts/MIR-004/confirm", {
    attribute: "donor_year",
    value: "2018",
    lang: "en",
  });
  console.log("   donor_year:", c1.ledger.ledger.donor_year.status, c1.ledger.ledger.donor_year.value);
  console.log("   Open after:", statusSummary(c1.ledger));
  console.log();

  // 4. Confirm structural_damage="cracked lower mounting tab"
  console.log('4. POST confirm structural_damage="cracked lower mounting tab"');
  const c2 = await post("/api/parts/MIR-004/confirm", {
    attribute: "structural_damage",
    value: "cracked lower mounting tab",
    lang: "en",
  });
  console.log("   structural_damage:", c2.ledger.ledger.structural_damage.status, c2.ledger.ledger.structural_damage.value);
  console.log("   Open after:", statusSummary(c2.ledger));
  console.log();

  // 5. Confirm tested=untested
  console.log("5. POST confirm tested=untested");
  const c3 = await post("/api/parts/MIR-004/confirm", {
    attribute: "tested",
    value: "untested",
    lang: "en",
  });
  console.log("   tested:", c3.ledger.ledger.tested.status, c3.ledger.ledger.tested.value);
  console.log("   Open after:", statusSummary(c3.ledger));
  console.log();

  // 6. Questions again — verify only part_number remains open
  console.log("6. GET /api/parts/MIR-004/questions?lang=en (after confirms)");
  const qs2 = await get("/api/parts/MIR-004/questions?lang=en");
  console.log(`   ${qs2.questions.length} questions:`);
  for (const q of qs2.questions) {
    console.log(`   - [${q.attribute}] ${q.text}`);
  }
  console.log();

  // Final summary
  const finalLedger = c3.ledger;
  const summary = statusSummary(finalLedger);
  console.log("=== Final Ledger Summary ===");
  console.log("Verified:", summary.verifiedAttrs.join(", "));
  console.log(`Open (${summary.open}):`, summary.openAttrs.join(", "));
  console.log();

  // Verify the assertion: only part_number should remain open among required attrs
  const requiredOpen = summary.openAttrs.filter((a) =>
    !["part_type", "side", "part_number", "manufacturer",
      "donor_make", "donor_model", "donor_year", "features",
      "cosmetic_condition", "structural_damage", "glass_condition",
      "tested", "included_components", "packaged_dimensions_cm",
      "packaged_weight_kg"].some((r) => a.startsWith(r)),
  );
  const partNumberOpen = summary.openAttrs.some((a) => a.startsWith("part_number"));
  console.log(`part_number is open: ${partNumberOpen ? "YES ✓" : "NO ✗"}`);

  // Also test Arabic questions
  console.log("\n=== Arabic Questions ===");
  const qsAr = await get("/api/parts/MIR-004/questions?lang=ar");
  for (const q of qsAr.questions) {
    console.log(`   - [${q.attribute}] ${q.text}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
