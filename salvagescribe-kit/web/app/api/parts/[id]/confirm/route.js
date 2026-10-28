// POST /api/parts/:id/confirm — { attribute, value, lang }
// Single-source-of-truth propagation: one confirm reclassifies the part and
// instantly changes draft inputs + readiness results (they all read the ledger).
import { getLedger, persist } from "../../../../../lib/store.js";
import { confirmAnswer } from "../../../../../lib/engine/questions.js";
import { evaluateReadiness } from "../../../../../lib/engine/readiness.js";
import {
  createSupabaseServerClient,
  logAudit,
} from "../../../../../lib/supabase.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const { attribute, value, lang } = await req.json();
  if (!attribute || value === undefined) {
    return Response.json(
      { error: "Request body must include { attribute, value }" },
      { status: 400 },
    );
  }

  try {
    const updatedLedger = confirmAnswer(l, attribute, value, lang || "en");
    const ready = evaluateReadiness(l);
    updatedLedger.classification = ready.class;
    const supabase = await createSupabaseServerClient();
    await persist(l, ready.class, supabase);
    await logAudit(supabase, {
      part_id: partId,
      operation: "confirm",
      payload: { attribute, value, classification: ready.class },
    });
    return Response.json({
      part_id: partId,
      confirmed: attribute,
      ledger: updatedLedger,
      classification: ready.class,
    });
  } catch (err) {
    console.error(`Confirm failed for ${partId}/${attribute}:`, err.message);
    return Response.json({ error: err.message, part_id: partId }, { status: 500 });
  }
}
