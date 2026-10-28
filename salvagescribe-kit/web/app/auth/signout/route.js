import { createSupabaseServerClient } from "@/lib/supabase.js";
import { apiResponse, sameOrigin } from "@/lib/platform-api.js";
export async function POST(req) {
  return apiResponse(async () => {
    sameOrigin(req);
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return { signedOut: true };
  });
}
