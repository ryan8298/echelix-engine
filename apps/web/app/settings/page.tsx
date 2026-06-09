import { getAdminSupabase } from "@/lib/supabase/server";
import { loadConfig } from "@echelix/core";
import { SettingsForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = getAdminSupabase();
  const cfg = await loadConfig(sb);

  // Distinct industries from the loaded accounts — populates the mapping editor.
  const ir = await sb.from("accounts").select("source_industry").not("source_industry", "is", null).limit(10000);
  const industries = Array.from(new Set(((ir.data as Array<{ source_industry: string | null }> | null) ?? []).map((r) => r.source_industry).filter(Boolean) as string[])).sort();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="muted mt-1 text-sm">
          Live engine configuration. Changes write to <span className="font-mono">engine_config</span> and are read by every worker on its next run — no redeploys needed.
        </p>
      </div>
      <SettingsForms cfg={cfg} industries={industries} />
    </div>
  );
}
