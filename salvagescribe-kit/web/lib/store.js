import { readFileSync } from "node:fs";
import { loadAll } from "./engine/loader.js";
import path from "node:path";
import { createSupabaseServerClient, isSupabaseConfigured } from "./supabase.js";
import { decodeLedger, readiness } from "./platform-engine.js";

export class ApiError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; }
}

export function check(result) {
  if (result.error) {
    const { code } = result.error;
    if (["42P01", "PGRST202", "PGRST205"].includes(code)) throw new ApiError("Database setup required: run web/supabase/platform.sql in your Supabase SQL Editor.", 503, "SETUP_REQUIRED");
    if (code === "40001" || code === "23505") throw new ApiError("This record changed or already exists. Refresh before saving.", 409);
    if (code === "42501") throw new ApiError("You do not have access to this record.", 403);
    console.error("Supabase operation failed", code, result.error.message);
    throw new ApiError("Database operation failed. No changes were committed.", 503);
  }
  return result.data;
}

export async function session() {
  if (!isSupabaseConfigured) throw new ApiError("Configure Supabase to sign in.", 503);
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ApiError("Sign in to continue.", 401);
  return { db, user: data.user };
}

export function demoLedgers() {
  const originals = loadAll(path.join(process.cwd(), "data")).map(decodeLedger);
  const saved = JSON.parse(readFileSync(path.join(process.cwd(), "data/existing_records.json"), "utf8"));
  const records = new Map(originals.map(l => [l.part_id, l]));
  for (const l of saved) records.set(l.part_id, decodeLedger(l));
  return [...records.values()];
}

export async function getAllLedgers(ctx) {
  return check(await ctx.db.from("scribe_records").select("*").eq("owner_id", ctx.user.id).order("updated_at", { ascending: false }));
}

export async function getLedger(id, ctx) {
  const row = check(await ctx.db.from("scribe_records").select("*").eq("owner_id", ctx.user.id).eq("part_id", String(id).toUpperCase()).maybeSingle());
  if (!row) throw new ApiError("Part not found.", 404);
  return { ...row, ledger: decodeLedger(row.ledger) };
}

export async function persist(record, ctx, operation, payload = {}) {
  const ledger = decodeLedger(record.ledger);
  ledger.photos = ledger.photos.map(({ url, ...photo }) => photo);
  readiness(ledger, record.draft);
  return check(await ctx.db.rpc("scribe_commit", {
    p_part_id: record.part_id, p_revision: record.revision || 0,
    p_ledger: ledger, p_draft: record.draft || null, p_operation: operation, p_payload: payload,
  }));
}

export async function presentRecord(record, ctx) {
  const ledger = decodeLedger(record.ledger);
  const ready = readiness(ledger, record.draft);
  if (ctx) for (const photo of ledger.photos) {
    if (photo.path) {
      const result = await ctx.db.storage.from("scribe-evidence").createSignedUrl(photo.path, 3600);
      if (!result.error) photo.url = result.data.signedUrl;
    }
  }
  return { ...record, ledger, readiness: ready };
}
