import { apiResponse, boot, command, query, sameOrigin } from "@/lib/platform-api.js";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req) {
  return apiResponse(() => req.nextUrl.searchParams.has("view") ? query(req.nextUrl.searchParams) : boot());
}
export async function POST(req) {
  return apiResponse(async () => {
    sameOrigin(req);
    const raw = await req.text();
    if (raw.length > 100000) throw new Error("Request too large");
    return command(JSON.parse(raw));
  });
}
