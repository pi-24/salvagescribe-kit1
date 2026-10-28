import { apiResponse } from "@/lib/platform-api.js";
import { marketplaceRecords } from "@/lib/marketplace-catalog.js";
export const dynamic = "force-dynamic";
// Only the supplied public catalog is exposed; saved account records stay private.
export async function GET() {
  return apiResponse(async () => ({ records: marketplaceRecords() }));
}
