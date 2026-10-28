import { apiResponse } from "@/lib/platform-api.js";
import { loadAll } from "@/lib/engine/loader.js";
import { decodeLedger, readiness } from "@/lib/platform-engine.js";
import path from "node:path";
export const dynamic = "force-dynamic";
// Guest browsing uses only the supplied catalog. Private saved account records
// and the SQLite snapshot remain behind the authenticated platform API.
export async function GET() {
  return apiResponse(async () => ({ records: loadAll(path.join(process.cwd(), "data")).map(source => {
    const ledger = decodeLedger(source);
    return { part_id: ledger.part_id, revision: 0, ledger, draft: null, readiness: readiness(ledger), preview: true };
  }) }));
}
