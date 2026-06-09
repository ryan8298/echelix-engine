"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={onClick} className="hover:text-neutral-200 underline-offset-4 hover:underline">
      Sign out
    </button>
  );
}
