// POST /api/parts/:id/ingest — photos + spreadsheet + notes → ledger (GLM-5)
import { getLedger, persist } from "../../../../../lib/store.js";
import { ingestPart } from "../../../../../lib/engine/ingest.js";
import { evaluateReadiness } from "../../../../../lib/engine/readiness.js";
import { ledgerToJSON } from "../../../../../lib/engine/ledger.js";
import {
  createSupabaseServerClient,
  logAudit,
} from "../../../../../lib/supabase.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  try {
    const result = await ingestPart(l);
    const ready = evaluateReadiness(l);
    result.ledger_json.classification = ready.class;
    const supabase = await createSupabaseServerClient();
    await persist(l, ready.class, supabase);
    await logAudit(supabase, {
      part_id: partId,
      operation: "ingest",
      payload: { classification: ready.class },
    });
    return Response.json(result);
  } catch (err) {
    console.error(`Ingest failed for ${partId}:`, err.message);
    return Response.json({ error: err.message, part_id: partId }, { status: 500 });
  }
}
