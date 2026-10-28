// POST /api/parts/:id/approve — T-03 human-in-the-loop approval gate.
// Only succeeds when the checklist class is READY_FOR_REVIEW. Listings are
// never auto-published; approval records the seller's explicit sign-off.
import { getLedger, persist } from "../../../../../lib/store.js";
import { approvePart } from "../../../../../lib/engine/readiness.js";
import {
  createSupabaseServerClient,
  logAudit,
} from "../../../../../lib/supabase.js";

export const dynamic = "force-dynamic";

export async function POST(_req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const result = approvePart(l);
  if (!result.approved) {
    return Response.json(result, { status: 409 });
  }

  const supabase = await createSupabaseServerClient();
  await persist(l, result.classification, supabase);
  await logAudit(supabase, {
    part_id: partId,
    operation: "approve",
    payload: result,
  });
  return Response.json(result);
}
