import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";

/**
 * Creates a user's first workspace.
 *
 * This runs with the service key, deliberately.
 *
 * Creating a workspace is a bootstrap operation that RLS cannot express
 * cleanly: the creator is not yet a member, so the member-based read policy
 * hides the organization from them — which in turn blocks the membership
 * insert, whose policy has to look the organization up to confirm they created
 * it. Every ordering of those two statements deadlocks on the other.
 *
 * The safety property that matters is preserved: `userId` must come from an
 * already-verified session (`auth.getUser()`, which validates the JWT against
 * the auth server). This function never accepts a user id from a request body,
 * and it only ever grants the caller access to a workspace it creates for them
 * in the same call.
 */

export type ProvisionInput = {
  /** Must come from a verified session, never from client input. */
  userId: string;
  username: string;
  displayName: string;
  businessName: string;
};

export type ProvisionResult =
  | { ok: true; organizationId: string; created: boolean }
  | { ok: false; error: string };

export async function provisionWorkspace(
  input: ProvisionInput,
): Promise<ProvisionResult> {
  if (!hasServiceClient()) {
    return {
      ok: false,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not configured, so a workspace cannot be created.",
    };
  }

  const admin = getServiceClient();

  // --- already has one? ----------------------------------------------------
  const { data: existing } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", input.userId)
    .limit(1)
    .maybeSingle();

  if (existing?.organization_id) {
    return {
      ok: true,
      organizationId: existing.organization_id as string,
      created: false,
    };
  }

  // --- profile -------------------------------------------------------------
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: input.userId,
      username: input.username,
      display_name: input.displayName,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return {
      ok: false,
      error: /username/i.test(profileError.message)
        ? "That username is already taken. Choose another."
        : `Your profile could not be saved: ${profileError.message}`,
    };
  }

  // --- organization --------------------------------------------------------
  const baseSlug = slugify(input.businessName).replace(/_/g, "-") || "workspace";
  let organizationId: string | null = null;
  let lastError = "";

  for (let attempt = 0; attempt < 5 && !organizationId; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const candidateId = randomUUID();

    const { error } = await admin.from("organizations").insert({
      id: candidateId,
      name: input.businessName,
      slug,
      created_by: input.userId,
    });

    if (!error) {
      organizationId = candidateId;
      break;
    }
    lastError = error.message;
    // Only a slug collision is worth another attempt.
    if (!/slug|duplicate key/i.test(error.message)) break;
  }

  if (!organizationId) {
    return {
      ok: false,
      error: `The workspace could not be created: ${lastError || "unknown error"}`,
    };
  }

  // --- owner membership ----------------------------------------------------
  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: input.userId,
    role: "owner",
  });

  if (memberError) {
    // Leave nothing half-built: without a membership the organization is
    // unreachable by anyone, including its creator.
    await admin.from("organizations").delete().eq("id", organizationId);
    return {
      ok: false,
      error: `Access to the new workspace could not be granted: ${memberError.message}`,
    };
  }

  // --- default report branding --------------------------------------------
  // Best effort: a missing branding row only means exports are unbranded.
  await admin
    .from("report_branding")
    .upsert(
      { organization_id: organizationId, business_name: input.businessName },
      { onConflict: "organization_id" },
    );

  return { ok: true, organizationId, created: true };
}
