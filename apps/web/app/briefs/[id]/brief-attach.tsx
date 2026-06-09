"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadBriefPdf } from "./actions";

export function BriefAttach({ briefId, label = "Upload PDF" }: { briefId: string; label?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Expected a PDF file");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("brief_id", briefId);
    startTransition(async () => {
      const r = await uploadBriefPdf(fd);
      if ("error" in r && r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-md border border-dashed px-4 py-6 text-center text-sm ${dragging ? "border-accent bg-blue-950/20" : "border-border bg-neutral-900/40"}`}
      >
        {pending ? "Uploading…" : dragging ? "Drop PDF" : `${label} (drag or click)`}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
