// GET /api/parts/:id/readiness — versioned UAE→UK checklist evaluation
import { getLedger, persist } from "../../../../../lib/store.js";
import { evaluateReadiness } from "../../../../../lib/engine/readiness.js";
import { ledgerToJSON } from "../../../../../lib/engine/ledger.js";
import { createSupabaseServerClient } from "../../../../../lib/supabase.js";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const result = evaluateReadiness(l);
  const supabase = await createSupabaseServerClient();
  await persist(l, result.class, supabase);
  return Response.json(result);
}
