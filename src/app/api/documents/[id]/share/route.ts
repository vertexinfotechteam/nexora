import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import { ensureShareToken, revokeShareToken } from "@/lib/documents/share";
import { audit } from "@/lib/store";
import { isUuid } from "@/lib/security/validate";

/** Creates (or returns) the public link for a document. */
export async function POST(
  _request: NextRequest,
  context: RouteContext<"/api/documents/[id]/share">,
) {
  let session;
  try {
    session = await requireSession();
    assertCanWrite(session);
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const { id } = await context.params;
  // The path segment is untrusted. Without this the id reaches Postgres, the
  // uuid cast throws, and the route answers 500 instead of 404.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`;

  const share = await ensureShareToken(session, id, origin);
  if (!share) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await audit({
    organization_id: session.organizationId,
    user_id: session.userId,
    action: "document.shared",
    resource_type: "document",
    resource_id: id,
  });

  return NextResponse.json(share);
}

/** Revokes the link. Anyone holding it loses access immediately. */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/documents/[id]/share">,
) {
  let session;
  try {
    session = await requireSession();
    assertCanWrite(session);
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const { id } = await context.params;
  // The path segment is untrusted. Without this the id reaches Postgres, the
  // uuid cast throws, and the route answers 500 instead of 404.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ok = await revokeShareToken(session, id);
  if (!ok) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await audit({
    organization_id: session.organizationId,
    user_id: session.userId,
    action: "document.share_revoked",
    resource_type: "document",
    resource_id: id,
  });

  return NextResponse.json({ ok: true });
}
