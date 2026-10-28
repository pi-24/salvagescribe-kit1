// POST /api/parts/:id/draft/edit — store Noor's manual text edits
import { getLedger } from "../../../../../lib/store.js";
import { storeManualEdit } from "../../../../../lib/engine/draft.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const { title, description_markdown } = await req.json();
  if (!title && !description_markdown) {
    return Response.json(
      { error: "Request body must include { title } or { description_markdown }" },
      { status: 400 },
    );
  }

  const edits = {};
  if (title) edits.title = title;
  if (description_markdown) edits.description_markdown = description_markdown;

  const stored = storeManualEdit(partId, edits);
  return Response.json({ part_id: partId, edits_stored: stored });
}
