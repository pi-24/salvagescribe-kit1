import { session, check, ApiError, demoLedgers, getAllLedgers, getLedger, persist, presentRecord } from "./store.js";
import { correctLedger, createPart, makeDraft, draftIssues, readiness, CHECKLIST_VERSION } from "./platform-engine.js";
import { generateDraft } from "./engine/draft.js";
import { ingestPart } from "./engine/ingest.js";
import { generateQuestions } from "./engine/questions.js";
import { askAssistant } from "./engine/assistant.js";
import { isMock, modelName } from "./engine/llm.js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function apiResponse(fn) {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error.message, code: error.code }, { status: error.status || 400 }); }
}

export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new ApiError("Cross-origin mutation rejected", 403);
}

async function generate(record) {
  const canonical = makeDraft(record.ledger);
  if (!isMock) {
    const generated = await generateDraft(record.ledger);
    if (!generated.blocked && generated.draft) {
      const candidate = { ...canonical, title: generated.draft.title, description_markdown: generated.draft.description_markdown };
      if (!draftIssues(record.ledger, candidate).length) return { ...candidate, generated_by: modelName };
    }
  }
  return { ...canonical, generated_by: isMock ? "deterministic-ledger-template" : "guardrailed-ledger-template" };
}

async function ingest(record, ctx) {
  if (record.ledger.ingested) return;
  if (isMock) {
    if (!record.ledger.demo) throw new ApiError("Live AI is not configured. Your intake is saved; confirm attributes manually or configure LLM_API_KEY.", 503);
    const file = fileURLToPath(new URL(`../data/mock_responses/ingest_${record.part_id}.json`, import.meta.url));
    if (!existsSync(file)) throw new ApiError("No demo evidence exists for this part", 400);
  }
  const signed = await presentRecord(record, ctx);
  await ingestPart(signed.ledger);
  record.ledger = signed.ledger;
  record.ledger.ingested = true;
}

export async function boot() {
  const ctx = await session();
  const meta = { user: { id: ctx.user.id, email: ctx.user.email }, ai: { mode: isMock ? "demo" : "live", model: isMock ? "Deterministic demo" : modelName }, checklist_version: CHECKLIST_VERSION, integrations: { ebay: false, escrow: false, transcription: false } };
  try {
    const records = await getAllLedgers(ctx);
    return { ...meta, storage: "supabase", records: await Promise.all(records.map((r) => presentRecord(r, ctx))) };
  } catch (err) {
    if (err.code !== "SETUP_REQUIRED") throw err;
    return { ...meta, storage: "setup-required", error: err.message, records: [] };
  }
}

export async function command(body) {
  const ctx = await session();
  const { action, part_id, revision, lang = "en" } = body;
  if (action === "seed") {
    const existing = new Set((await getAllLedgers(ctx)).map((r) => r.part_id));
    let created = 0;
    for (const ledger of demoLedgers()) {
      if (existing.has(ledger.part_id)) continue;
      ledger.demo = true;
      const r = { part_id: ledger.part_id, revision: 0, ledger, draft: null };
      const file = fileURLToPath(new URL(`../data/mock_responses/ingest_${ledger.part_id}.json`, import.meta.url));
      if (existsSync(file)) {
        const fixture = JSON.parse(readFileSync(file, "utf8"));
        const { setCandidate, resolveAll, confirm } = await import("./engine/ledger.js");
        for (const a of fixture.attributes || []) if (a.value != null && r.ledger._attr_order.includes(a.attribute)) setCandidate(r.ledger, a.attribute, a.value, a.source, a.source_ref);
        resolveAll(r.ledger);
        r.ledger.possible_damage = fixture.possible_damage || [];
        r.ledger.notes.ar_to_en = fixture.translated_notes?.ar_to_en;
        r.ledger.ingested = true;
        if (ledger.part_id === "MIR-001") {
          for (const [a, row] of Object.entries(ledger.ledger)) if (row.value != null && row.status !== "CONFLICTING" && !String(row.value).includes("?")) confirm(ledger, a, row.value);
          for (const [a, v] of Object.entries({ packaged_dimensions_cm: "35 x 25 x 20", packaged_weight_kg: "1.8" })) confirm(ledger, a, v);
          ledger.demo_note = "Synthetic normal-journey confirmations and packing measurements. Not real seller evidence.";
          r.draft = makeDraft(ledger);
        }
      }
      await persist(r, ctx, "demo_import", { synthetic: true });
      created++;
    }
    return { created };
  }
  if (action === "create") {
    const ledger = createPart(body.input || {});
    return { record: await presentRecord(await persist({ part_id: ledger.part_id, revision: 0, ledger }, ctx, "intake"), ctx) };
  }
  if (action === "thread") {
    if (!UUID.test(body.recipient || "") || body.recipient === ctx.user.id) throw new ApiError("Enter another registered user's account ID");
    const record = await getLedger(part_id, ctx);
    const thread = check(await ctx.db.from("scribe_threads").insert({ owner_id: ctx.user.id, recipient_id: body.recipient, record_id: record.id, subject: `${record.part_id} · ${record.ledger.spreadsheet_row?.description || "Part inquiry"}`.slice(0, 200) }).select().single());
    return { thread };
  }
  if (action === "message") {
    if (!UUID.test(body.thread_id || "")) throw new ApiError("Select a conversation");
    const text = String(body.text || "").trim();
    if (!text || text.length > 4000) throw new ApiError("Message must contain 1–4000 characters");
    const kind = ["text", "offer", "audio"].includes(body.kind) ? body.kind : "text";
    if (kind === "offer" && (!Number.isFinite(Number(body.amount)) || +body.amount <= 0 || +body.amount > 1000000)) throw new ApiError("Enter a valid AED offer amount");
    if (body.attachment && !body.attachment.startsWith(ctx.user.id + "/")) throw new ApiError("Attachment access denied", 403);
    const message = check(await ctx.db.from("scribe_messages").insert({ thread_id: body.thread_id, sender_id: ctx.user.id, body: text, kind, amount: kind === "offer" ? +body.amount : null, attachment: body.attachment || null }).select().single());
    return { message };
  }
  const record = await getLedger(part_id, ctx);
  if (action === "ask") {
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 3000) throw new ApiError("Enter a question up to 3000 characters");
    const reply = await askAssistant(record.ledger, body.text, lang);
    await persist(record, ctx, "assistant", { model: isMock ? "demo" : modelName, question: body.text, reply: reply.reply });
    return reply;
  }
  if (!Number.isInteger(revision) || record.revision !== revision) throw new ApiError("Record changed. Refresh and retry your change.", 409);
  let payload = { ai_mode: isMock ? "demo" : "live" };
  switch (action) {
    case "confirm":
      record.ledger = correctLedger(record.ledger, body.changes || { [body.attribute]: body.value }, lang);
      payload.changes = body.changes || { [body.attribute]: body.value };
      if (record.draft) { record.ledger.previous_draft = record.draft; record.draft = makeDraft(record.ledger); }
      break;
    case "ingest":
      await ingest(record, ctx);
      if (record.draft) { record.ledger.previous_draft = record.draft; record.draft = makeDraft(record.ledger); }
      break;
    case "generate":
      record.draft = await generate(record);
      break;
    case "edit": {
      if (!record.draft) throw new ApiError("Generate a draft first");
      const candidate = { ...record.draft, title: body.title, description_markdown: body.description_markdown, approved: false, status: "draft" };
      const issues = draftIssues(record.ledger, candidate);
      if (issues.length) throw new ApiError(issues.join("; "), 422);
      record.draft = candidate;
      break;
    }
    case "approve": {
      const ready = readiness(record.ledger, record.draft);
      const issues = draftIssues(record.ledger, record.draft);
      if (ready.class !== "READY_FOR_REVIEW" || issues.length) throw new ApiError("Approval blocked: resolve required checks and save a valid draft first", 409);
      record.draft = { ...record.draft, approved: true, approved_by: ctx.user.id, approved_at: new Date().toISOString(), approved_revision: record.revision + 1, checklist_version: CHECKLIST_VERSION, status: "draft" };
      break;
    }
    default: throw new ApiError("Unknown operation");
  }
  if (action !== "approve" && record.draft) { record.draft.approved = false; delete record.draft.approved_at; delete record.draft.approved_revision; }
  const saved = await persist(record, ctx, action, payload);
  return { record: await presentRecord(saved, ctx) };
}

export async function query(params) {
  const ctx = await session();
  const view = params.get("view");
  if (view === "threads") return { threads: check(await ctx.db.from("scribe_threads").select("*").order("created_at", { ascending: false })) };
  if (view === "messages") {
    const id = params.get("thread_id");
    if (!UUID.test(id || "")) throw new ApiError("Invalid conversation");
    const messages = check(await ctx.db.from("scribe_messages").select("*").eq("thread_id", id).order("created_at").limit(200));
    for (const m of messages) if (m.attachment) { const signed = await ctx.db.storage.from("scribe-evidence").createSignedUrl(m.attachment, 3600); if (!signed.error) m.url = signed.data.signedUrl; }
    return { messages };
  }
  const record = await getLedger(params.get("part_id"), ctx);
  if (view === "questions") return { questions: await generateQuestions(record.ledger, params.get("lang") === "ar" ? "ar" : "en") };
  if (view === "audit") return { events: check(await ctx.db.from("scribe_events").select("*").eq("record_id", record.id).order("created_at", { ascending: false }).limit(100)) };
  return { record: await presentRecord(record, ctx) };
}
