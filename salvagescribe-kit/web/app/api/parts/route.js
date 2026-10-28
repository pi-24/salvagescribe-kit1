// GET /api/parts — board view with readiness class per part
import { getBoard } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getBoard());
}
