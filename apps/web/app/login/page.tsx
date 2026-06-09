"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSubmitting(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-semibold">Echelix Engine</h1>
      <p className="muted mt-1 text-sm">Sign in with a magic link.</p>
      {reason === "not_allowed" ? (
        <div className="card mt-4 border-amber-800/40 bg-amber-950/20 text-sm text-amber-200">
          Your email isn't on this engine's allowlist. Ask Ryan to add you.
        </div>
      ) : null}
      {sent ? (
        <div className="card mt-6 text-sm">
          Check <span className="font-mono">{email}</span> for a sign-in link.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@echelix.com" className="input w-full"
          />
          <button disabled={submitting} className="btn-primary w-full">
            {submitting ? "Sending…" : "Send magic link"}
          </button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
