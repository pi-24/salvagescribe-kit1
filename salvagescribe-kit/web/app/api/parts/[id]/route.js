// GET /api/parts/:id — full ledger JSON with provenance
import { getLedger, classify } from "../../../../lib/store.js";
import { ledgerToJSON } from "../../../../lib/engine/ledger.js";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const l = getLedger(id);
  if (!l) {
    return Response.json({ error: `Part ${id} not found` }, { status: 404 });
  }
  return Response.json(classify(l));
}
