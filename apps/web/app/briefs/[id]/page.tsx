import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtDate, fmtScore } from "@/lib/format";
import { BriefAttach } from "./brief-attach";
import { BriefStatusButtons } from "./status-buttons";

export const dynamic = "force-dynamic";

type Brief = {
  id: string; brief_date: string; status: "draft" | "reviewed" | "sent";
  pdf_path: string | null; markdown_path: string | null;
  score_at_pick: number | null; notes: string | null; account_id: string;
  accounts: { tpid: number; company_name: string; industry: string } | null;
};

export default async function BriefDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getAdminSupabase();
  const res = await sb.from("briefs")
    .select("id,brief_date,status,pdf_path,markdown_path,score_at_pick,notes,account_id,accounts(tpid,company_name,industry)")
    .eq("id", id).maybeSingle();
  const brief = res.data as unknown as Brief | null;
  if (!brief) return notFound();

  let pdfSignedUrl: string | null = null;
  if (brief.pdf_path) {
    const { data } = await sb.storage.from("briefs").createSignedUrl(brief.pdf_path, 60 * 60);
    pdfSignedUrl = data?.signedUrl ?? null;
  }

  const account = brief.accounts;
  const skillCommand = `/echelix-cosell-brief ${account?.company_name ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label">{fmtDate(brief.brief_date)} · {account?.industry ?? ""}</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {account ? <Link href={`/accounts/${account.tpid}`} className="hover:underline">{account.company_name}</Link> : "—"}
          </h1>
          <p className="muted mt-1 text-sm">score {fmtScore(brief.score_at_pick)}</p>
        </div>
        <span className="badge">{brief.pdf_path ? brief.status : "pending generation"}</span>
      </div>

      {!brief.pdf_path ? (
        <div className="card space-y-3">
          <h2 className="label">Generate the PDF</h2>
          <p className="text-sm">
            Open Claude Code and run the brief skill. The skill will pause for you to validate workload selection — that's the gate that matters.
          </p>
          <pre className="rounded bg-neutral-900 px-3 py-2 font-mono text-sm">{skillCommand}</pre>
          <p className="muted text-xs">
            Skill writes the PDF to <code>/mnt/user-data/outputs/Echelix_*.pdf</code>. After it's generated, drag the file onto the upload box below to attach it.
          </p>
          <BriefAttach briefId={id} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <BriefStatusButtons briefId={id} currentStatus={brief.status} />
            {pdfSignedUrl ? <a href={pdfSignedUrl} target="_blank" rel="noreferrer" className="btn">Open in tab</a> : null}
            <BriefAttach briefId={id} label="Replace PDF" />
          </div>
          {pdfSignedUrl ? (
            <iframe src={pdfSignedUrl} className="h-[80vh] w-full rounded-md border border-border bg-white" />
          ) : (
            <div className="card muted text-sm">PDF stored but signed URL failed to generate.</div>
          )}
        </>
      )}
    </div>
  );
}
