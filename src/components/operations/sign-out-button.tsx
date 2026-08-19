"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/**
 * Signs the operator out through the same endpoint the app uses, so the
 * session cookie is cleared by the one piece of code that knows how.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 text-[12.5px] text-white/70 transition-colors hover:text-white disabled:opacity-60"
    >
      <LogOut className="h-3.5 w-3.5" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
