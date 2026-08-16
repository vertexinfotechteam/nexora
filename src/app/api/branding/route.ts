import { NextResponse, type NextRequest } from "next/server";
import {
  assertCanWrite,
  requireSession,
  SessionError,
} from "@/lib/auth/session";
import { BRANDING_LIMITS, getBranding, saveBranding, toDataUrl } from "@/lib/branding";
import { audit } from "@/lib/store";

export const maxDuration = 60;

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json(await getBranding(session));
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }
}

/**
 * Saves report branding. Images arrive as multipart files, are validated by
 * size and content signature, and are stored as data URLs for embedding into
 * generated PDFs and workbooks.
 */
export async function POST(request: NextRequest) {
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

  try {
    const form = await request.formData();

    const patch: Parameters<typeof saveBranding>[1] = {};

    const text = (key: string): string | null => {
      const value = form.get(key);
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
    };

    if (form.has("business_name")) patch.business_name = text("business_name");
    if (form.has("signatory_name")) patch.signatory_name = text("signatory_name");
    if (form.has("signatory_title")) {
      patch.signatory_title = text("signatory_title");
    }

    for (const [field, key] of [
      ["logo", "logo_data_url"],
      ["signature", "signature_data_url"],
    ] as const) {
      // An explicit clear flag removes the stored image.
      if (form.get(`${field}_clear`) === "1") {
        patch[key] = null;
        continue;
      }
      const file = form.get(field);
      if (file instanceof File && file.size > 0) {
        if (file.size > BRANDING_LIMITS.maxBytes) {
          return NextResponse.json(
            {
              error: `${field === "logo" ? "Logo" : "Signature"} is larger than ${Math.round(
                BRANDING_LIMITS.maxBytes / 1024,
              )} KB.`,
            },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        patch[key] = toDataUrl(buffer, file.type);
      }
    }

    const branding = await saveBranding(session, patch);

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "branding.updated",
      resource_type: "organization",
      resource_id: session.organizationId,
      metadata: {
        fields: Object.keys(patch),
        hasLogo: Boolean(branding.logo_data_url),
        hasSignature: Boolean(branding.signature_data_url),
      },
    });

    return NextResponse.json(branding);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The branding could not be saved.",
      },
      { status: 400 },
    );
  }
}
