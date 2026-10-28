// GET /api/parts/:id/draft — eBay-standard listing draft with guardrails
import { getLedger } from "../../../../../lib/store.js";
import { generateDraft, applyManualEdits } from "../../../../../lib/engine/draft.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  try {
    const result = await generateDraft(l);
    if (!result.blocked && result.draft) {
      const edited = applyManualEdits(partId, result.draft);
      result.draft = edited.draft;
      result.edits_applied = edited.edits_applied;
      result.edit_conflicts = edited.conflicts;
    }
    return Response.json(result);
  } catch (err) {
    console.error(`Draft failed for ${partId}:`, err.message);
    return Response.json({ error: err.message, part_id: partId }, { status: 500 });
  }
}
