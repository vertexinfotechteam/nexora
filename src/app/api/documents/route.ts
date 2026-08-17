import { NextResponse, type NextRequest } from "next/server";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import { listDocuments, saveDocument } from "@/lib/documents/store";
import { audit } from "@/lib/store";
import type { BusinessDocument } from "@/lib/documents/types";
import { enforceLimit } from "@/lib/security/guard";

export async function GET() {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("read");
  if (limited) return limited;

  try {
    const session = await requireSession();
    return NextResponse.json({ documents: await listDocuments(session) });
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }
}

/** Creates or updates a document. The whole editable body is sent as JSON. */
export async function POST(request: NextRequest) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("read");
  if (limited) return limited;

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

  const body = (await request.json().catch(() => null)) as {
    document?: BusinessDocument;
  } | null;

  if (!body?.document?.id) {
    return NextResponse.json({ error: "No document supplied." }, { status: 400 });
  }

  try {
    const saved = await saveDocument(session, body.document);
    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "document.saved",
      resource_type: "document",
      resource_id: saved.id,
      metadata: { kind: saved.kind, items: saved.items.length },
    });
    return NextResponse.json({ document: saved });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The document could not be saved.",
      },
      { status: 500 },
    );
  }
}
