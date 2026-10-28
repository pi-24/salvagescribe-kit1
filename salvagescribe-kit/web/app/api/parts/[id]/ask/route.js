// POST /api/parts/:id/ask — "Ask SalvageScribe" free-text assistant (GLM-5).
// The model is read-only: any response that would mutate the ledger is rejected.
import { getLedger } from "../../../../../lib/store.js";
import { askAssistant } from "../../../../../lib/engine/assistant.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const { text, lang } = await req.json();
  if (!text || typeof text !== "string") {
    return Response.json({ error: "Request body must include { text }" }, { status: 400 });
  }

  try {
    const result = await askAssistant(l, text, lang || "en");
    return Response.json(result);
  } catch (err) {
    console.error(`Assistant failed for ${partId}:`, err.message);
    return Response.json({ error: err.message, part_id: partId }, { status: 500 });
  }
}
