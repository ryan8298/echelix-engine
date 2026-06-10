"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOutreach, deleteOutreach, approveOutreach, markSentOutreach } from "./outreach-actions";
import { FindProspectButton } from "./find-prospect-button";
// sendOutreachToOutlookDrafts kept available for the PDF-attach variant.

type Props = {
  outreach: {
    id: string;
    recipient: string | null;
    subject: string | null;
    body: string | null;
    status: "draft" | "approved" | "sent" | "failed";
    channel: "microsoft" | "prospect";
    brief_id: string | null;
  };
};

export function OutreachCard({ outreach }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(outreach.subject ?? "");
  const [body, setBody] = useState(outreach.body ?? "");
  const [recipient, setRecipient] = useState(outreach.recipient ?? "");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function save() {
    start(async () => {
      const r = await updateOutreach(outreach.id, { subject, body, recipient });
      if (r.error) alert(r.error);
      else { setEditing(false); router.refresh(); }
    });
  }

  function copy() {
    const text = `To: ${recipient}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="rounded-md border border-border bg-bg p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="badge">{outreach.status}</span>
        <div className="flex gap-2">
          {!editing ? <button className="btn" onClick={() => setEditing(true)}>Edit</button> : null}
          {editing ? (
            <>
              <button className="btn" onClick={() => { setEditing(false); setSubject(outreach.subject ?? ""); setBody(outreach.body ?? ""); setRecipient(outreach.recipient ?? ""); }}>Cancel</button>
              <button className="btn-primary" disabled={pending} onClick={save}>{pending ? "…" : "Save"}</button>
            </>
          ) : null}
          {!editing && outreach.status === "draft" ? (
            <button className="btn" disabled={pending} onClick={() => start(async () => {
              const r = await approveOutreach(outreach.id); if (r.error) alert(r.error); else router.refresh();
            })}>Approve</button>
          ) : null}
          {!editing && (outreach.status === "draft" || outreach.status === "approved") ? (
            <button className="btn-primary" onClick={() => {
              const to = encodeURIComponent(outreach.recipient ?? "");
              const subj = encodeURIComponent(outreach.subject ?? "");
              const body = encodeURIComponent(outreach.body ?? "");
              // Outlook Web deep-link — bypasses Mac default mail handler (Mail.app)
              // and opens directly in Outlook on the web. Works for both work + personal.
              const url = `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subj}&body=${body}`;
              window.open(url, "_blank");
            }} title="Opens Outlook on the web with this draft">
              Open in Outlook
            </button>
          ) : null}
          {!editing && outreach.status === "approved" ? (
            <button className="btn" disabled={pending} onClick={() => start(async () => {
              const r = await markSentOutreach(outreach.id); if (r.error) alert(r.error); else router.refresh();
            })}>Mark sent</button>
          ) : null}
          {!editing ? (
            <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          ) : null}
          {!editing && outreach.status === "draft" ? (
            <button className="btn" disabled={pending} onClick={() => start(async () => {
              if (!confirm("Delete this draft?")) return;
              const r = await deleteOutreach(outreach.id); if (r.error) alert(r.error); else router.refresh();
            })}>Delete</button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="label">To</span>
            <input className="input w-full" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Subject</span>
            <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Body</span>
            <textarea className="input min-h-[240px] w-full font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="muted">To:</span>
            {outreach.recipient ? <span>{outreach.recipient}</span> : <span className="muted italic">no recipient resolved</span>}
            {outreach.channel === "prospect" && outreach.brief_id ? (
              <FindProspectButton briefId={outreach.brief_id} outreachId={outreach.id} />
            ) : null}
          </div>
          <div><span className="muted">Subject:</span> {outreach.subject ?? "—"}</div>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{outreach.body ?? ""}</pre>
        </div>
      )}
    </div>
  );
}
