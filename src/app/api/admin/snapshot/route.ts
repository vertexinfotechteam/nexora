import { NextResponse } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { buildAdminSnapshot, canAccessAdmin } from "@/lib/admin";

/**
 * Admin snapshot, polled by the live panel.
 * Re-checks the role on every request — the page-level guard is convenience,
 * this is the boundary.
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  if (!canAccessAdmin(session)) {
    return NextResponse.json(
      { error: "The admin panel is limited to workspace owners and admins." },
      { status: 403 },
    );
  }

  const snapshot = await buildAdminSnapshot(session);
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "private, no-store" },
  });
}
