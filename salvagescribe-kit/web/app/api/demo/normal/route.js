// GET /api/demo/normal — part id for the conflict-free demo journey
import { findNormalJourneyPartId } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ part_id: findNormalJourneyPartId() });
}
