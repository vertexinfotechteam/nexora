import "server-only";

import { getSupabaseConfig } from "@/lib/env";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { findLocal, insertLocal, updateLocal } from "@/lib/store/local";
import { newId, storeMode } from "@/lib/store";
import type { Session } from "@/lib/store/types";

/**
 * Report branding: the business logo and authorised signature that appear on
 * exported PDF and Excel reports.
 *
 * Images are stored as data URLs rather than as objects in the file store.
 * They are small (capped below), read on almost every export, and embedding
 * them avoids a second round trip plus a signed-URL dance during rendering.
 */

export const BRANDING_LIMITS = {
  /** Roughly 400 KB of raw image, which is ample for a logo or a signature. */
  maxBytes: 400 * 1024,
  allowedTypes: ["image/png", "image/jpeg", "image/webp"] as const,
} as const;

export type Branding = {
  organization_id: string;
  /** Business name printed on the report. Falls back to the workspace name. */
  business_name: string | null;
  /** Data URL for the logo. */
  logo_data_url: string | null;
  /** Data URL for the signature image. */
  signature_data_url: string | null;
  /** Printed under the signature, e.g. "Tarang Vasoya". */
  signatory_name: string | null;
  /** Printed under the name, e.g. "Project Lead & CEO". */
  signatory_title: string | null;
  updated_at: string;
};

const COLLECTION = "branding";

export function emptyBranding(organizationId: string): Branding {
  return {
    organization_id: organizationId,
    business_name: null,
    logo_data_url: null,
    signature_data_url: null,
    signatory_name: null,
    signatory_title: null,
    updated_at: new Date().toISOString(),
  };
}

type LocalBrandingRow = Branding & { id: string };

export async function getBranding(session: Session): Promise<Branding> {
  return getBrandingForOrganization(session.organizationId);
}

/**
 * Branding by organization id, without a session.
 *
 * Needed by the public share routes: the recipient has no account, but the
 * document must still carry the sender's logo and signature. Only branding is
 * exposed this way — nothing else about the workspace.
 */
export async function getBrandingForOrganization(
  organizationId: string,
): Promise<Branding> {
  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<LocalBrandingRow>(
      COLLECTION,
      (row) => row.organization_id === organizationId,
    );
    return rows[0] ?? emptyBranding(organizationId);
  }

  const { data } = await getServiceClient()
    .from("report_branding")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return (data as Branding) ?? emptyBranding(organizationId);
}

export async function saveBranding(
  session: Session,
  patch: Partial<Omit<Branding, "organization_id" | "updated_at">>,
): Promise<Branding> {
  const current = await getBranding(session);
  const next: Branding = {
    ...current,
    ...patch,
    organization_id: session.organizationId,
    updated_at: new Date().toISOString(),
  };

  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<LocalBrandingRow>(
      COLLECTION,
      (row) => row.organization_id === session.organizationId,
    );
    if (rows[0]) {
      await updateLocal<LocalBrandingRow>(COLLECTION, rows[0].id, next);
    } else {
      await insertLocal<LocalBrandingRow>(COLLECTION, { ...next, id: newId() });
    }
    return next;
  }

  const { error } = await getServiceClient()
    .from("report_branding")
    .upsert(next, { onConflict: "organization_id" });
  if (error) throw new Error(`Could not save branding: ${error.message}`);
  return next;
}

/**
 * Validates an uploaded image and returns it as a data URL.
 * Rejects anything that is not a small raster image, since the value is later
 * embedded directly into generated documents.
 */
export function toDataUrl(buffer: Buffer, mimeType: string): string {
  if (!BRANDING_LIMITS.allowedTypes.includes(mimeType as never)) {
    throw new Error(
      `Unsupported image type. Use ${BRANDING_LIMITS.allowedTypes
        .map((t) => t.replace("image/", "").toUpperCase())
        .join(", ")}.`,
    );
  }
  if (buffer.byteLength > BRANDING_LIMITS.maxBytes) {
    throw new Error(
      `Image is larger than ${Math.round(BRANDING_LIMITS.maxBytes / 1024)} KB.`,
    );
  }

  // Confirm the bytes really are the image type claimed.
  const png = buffer[0] === 0x89 && buffer[1] === 0x50;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const webp =
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP";

  const matches =
    (mimeType === "image/png" && png) ||
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/webp" && webp);

  if (!matches) {
    throw new Error("That file is not a valid image of the type it claims.");
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function brandingBackend(): "supabase" | "local" {
  return getSupabaseConfig() ? "supabase" : "local";
}
