import { apiResponse, boot, command, query, sameOrigin } from "./platform-api.js";
export function legacy(action) {
  return async (req, context = {}) => apiResponse(async () => {
    const { id } = context.params ? await context.params : {};
    if (req.method === "POST") {
      sameOrigin(req);
      const raw = await req.text();
      return command({ ...(raw ? JSON.parse(raw) : {}), action, part_id: id });
    }
    if (action === "board" || action === "normal") {
      const data = await boot();
      if (action === "normal") return { part_id: data.records.find((r) => r.part_id === "MIR-001")?.part_id || null };
      return { count: data.records.length, parts: data.records.map((r) => ({ ...r, title: r.ledger.spreadsheet_row?.description, classification: r.readiness.class })) };
    }
    const params = new URLSearchParams({ view: action === "questions" ? "questions" : "record", part_id: id, lang: new URL(req.url).searchParams.get("lang") || "en" });
    const data = await query(params);
    if (action === "questions") return data;
    if (action === "readiness") return data.record.readiness;
    if (action === "draft") return { draft: data.record.draft, blocked: !data.record.draft, reason: "Generate a draft using POST /api/platform", revision: data.record.revision };
    return { ...data.record.ledger, revision: data.record.revision };
  });
}
