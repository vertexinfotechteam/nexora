"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/store";
import { provisionWorkspace } from "@/lib/auth/provision";
import type { AuthState } from "@/lib/auth/actions";

const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,32}$/, "Username must be 3-32 characters: a-z, 0-9 or _."),
  displayName: z.string().trim().min(1, "Enter your name.").max(80),
  workspaceName: z
    .string()
    .trim()
    .min(2, "Workspace name is too short.")
    .max(120, "Workspace name is too long."),
});

/**
 * Creates the profile, the organization and the owner membership.
 *
 * Ordering matters for RLS: the organization must exist with created_by set to
 * the caller before the owner membership row can pass its insert policy.
 */
export async function completeOnboardingAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = schema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    workspaceName: formData.get("workspaceName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { username, displayName, workspaceName } = parsed.data;

  // Profile, organization and owner membership are created together by the
  // provisioning helper. Doing it in one privileged step avoids the RLS
  // bootstrap deadlock: the creator cannot read the organization until they
  // are a member, and cannot become a member until the organization is
  // readable.
  const result = await provisionWorkspace({
    userId: user.id,
    username,
    displayName,
    businessName: workspaceName,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const organizationId = result.organizationId;

  await audit({
    organization_id: organizationId,
    user_id: user.id,
    action: "workspace.created",
    resource_type: "organization",
    resource_id: organizationId,
    metadata: { name: workspaceName },
  });

  redirect("/dashboard");
}
