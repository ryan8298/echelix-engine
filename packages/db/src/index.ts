import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type ServiceClient = SupabaseClient;

export function createServiceClient(): ServiceClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AccountRow = {
  tpid: number | null;
  company_name: string;
  industry: string | null;
  source_industry: string | null;
  source_vertical: string | null;
  hq_address: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_zip: string | null;
  hq_location: string | null;
  microsoft_team: Record<string, unknown> | null;
  status: string;
};
