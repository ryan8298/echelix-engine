"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadBriefPdf } from "./upload-pdf";

export function PdfUploadButton({ briefId }: { briefId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.includes("pdf")) { alert("PDF only"); return; }
    if (file.size > 50 * 1024 * 1024) { alert("Max 50MB"); return; }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const r = await uploadBriefPdf(briefId, file.name, Buffer.from(buf));
      if (r.error) alert(r.error);
      else { alert("PDF uploaded"); router.refresh(); }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept=".pdf" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <button
        className="btn-primary"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
      >
        {uploading ? "Uploading…" : dragActive ? "Drop PDF here" : "Upload PDF"}
      </button>
    </div>
  );
}
