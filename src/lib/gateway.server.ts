// Server-only module. Never import from client code.
import { createClient } from "@supabase/supabase-js";

// All secrets must be set as environment variables — no fallback defaults.
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("Missing env var: SUPABASE_URL");

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");

// Panel/admin API key expected in the `x-panel-key` request header.
export const PANEL_KEY = process.env.PANEL_KEY;
if (!PANEL_KEY) throw new Error("Missing env var: PANEL_KEY");

// Service role client: bypasses RLS. Server-only.
export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

export function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export function requirePanelKey(request: Request): Response | null {
    const key = request.headers.get("x-panel-key");
    if (key !== PANEL_KEY) {
        return jsonResponse({ error: "invalid panel key" }, 401);
    }
    return null;
}

// 10-digit numeric code, zero-padded.
export function generate10DigitCode(): string {
    const n = Math.floor(Math.random() * 10_000_000_000);
    return n.toString().padStart(10, "0");
}

// Returns the current 10-digit code for a department, rotating it if the
// existing code is older than 10 minutes (or if none exists).
export async function getOrRotateDepartmentCode(
    departmentId: string,
): Promise<{ code: string; rotated_at: string }> {
    const { data: existing } = await admin
        .from("department_codes")
        .select("code, rotated_at")
        .eq("department_id", departmentId)
        .maybeSingle();

    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    if (
        existing &&
        now - new Date(existing.rotated_at).getTime() < tenMinutes
    ) {
        return existing;
    }

    const code = generate10DigitCode();
    const rotated_at = new Date().toISOString();
    const { error } = await admin
        .from("department_codes")
        .upsert({ department_id: departmentId, code, rotated_at });
    if (error) throw error;
    return { code, rotated_at };
}
