// GET /api/parts/:id/questions?lang=en|ar — prioritised clarification questions
import { getLedger } from "../../../../../lib/store.js";
import { generateQuestions } from "../../../../../lib/engine/questions.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const { id } = await params;
  const partId = String(id).toUpperCase();
  const l = getLedger(partId);
  if (!l) {
    return Response.json({ error: `Part ${partId} not found` }, { status: 404 });
  }

  const lang = req.nextUrl.searchParams.get("lang") === "ar" ? "ar" : "en";
  try {
    const questions = await generateQuestions(l, lang);
    return Response.json({ part_id: partId, lang, questions });
  } catch (err) {
    console.error(`Questions failed for ${partId}:`, err.message);
    return Response.json({ error: err.message, part_id: partId }, { status: 500 });
  }
}
