import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client for the dedicated social-data Supabase project.
 * MUST use the service_role key (SB_DATA_SERVICE_KEY). RPC EXECUTE is revoked
 * for anon/authenticated in that project — anon/publishable keys will fail.
 * NEVER import this from browser code.
 */
let cached: SupabaseClient | null = null;
let cachedRole: string | null = null;

function decodeJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(
      typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf-8"),
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function getDataClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SB_DATA_URL ?? process.env.SUPABASE_DATA_URL;
  const key = process.env.SB_DATA_SERVICE_KEY ?? process.env.SUPABASE_DATA_SERVICE_KEY;
  if (!url) throw new Error("SB_DATA_URL não configurado");
  if (!key) throw new Error("SB_DATA_SERVICE_KEY não configurado");
  cachedRole = decodeJwtRole(key);
  if (cachedRole && cachedRole !== "service_role") {
    // Loud, one-time warning in server logs so misconfig is obvious.
    console.error(
      `[social-data] SB_DATA_SERVICE_KEY has role="${cachedRole}", expected "service_role". ` +
        `RPC calls will fail with "permission denied for function" because EXECUTE was revoked from ${cachedRole}.`,
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "social-data-server" } },
  });
  return cached;
}

export function getDataClientRole(): string | null {
  if (!cached) getDataClient();
  return cachedRole;
}

export async function callRpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = getDataClient();
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) {
    const role = cachedRole ?? "unknown";
    console.error(`[social-data] RPC ${fn} failed (key role=${role}):`, error);
    const hint =
      role !== "service_role"
        ? ` (chave em uso tem role="${role}"; use a service_role key em SB_DATA_SERVICE_KEY)`
        : "";
    const wrapped = new Error(`RPC ${fn} falhou: ${error.message}${hint}`) as Error & {
      code?: string;
      pgCode?: string;
      details?: string;
    };
    wrapped.code = (error as { code?: string }).code;
    wrapped.pgCode = (error as { code?: string }).code;
    wrapped.details = (error as { details?: string }).details;
    throw wrapped;
  }
  return data as T;
}
