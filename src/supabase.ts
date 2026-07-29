import { createClient } from "@supabase/supabase-js";

type RuntimeImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const runtimeEnv = (import.meta as RuntimeImportMeta).env ?? {};

const url = runtimeEnv.VITE_SUPABASE_URL?.trim()
  || "https://yoqsxkakoeqjbiaewdim.supabase.co";

const anonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY?.trim()
  || "sb_publishable_EcEY7-4lltS4WLSvjekdBw_BMWbjrxQ";

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        experimental: { passkey: true },
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("O Supabase ainda não foi configurado.");
  }

  return supabase;
}
