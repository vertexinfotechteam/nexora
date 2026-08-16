"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/store";
import { slugify } from "@/lib/utils";
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

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      username,
      display_name: displayName,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return {
      error: profileError.message.includes("profiles_username_key")
        ? "That username is taken. Choose another."
        : "Your profile could not be saved. Try again.",
    };
  }

  // Slug must be unique across all workspaces; add a short suffix on collision.
  const baseSlug = slugify(workspaceName).replace(/_/g, "-") || "workspace";
  let slug = baseSlug;
  let organizationId: string | null = null;

  for (let attempt = 0; attempt < 5 && !organizationId; attempt++) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name: workspaceName, slug, created_by: user.id })
      .select("id")
      .single();

    if (!error && data) {
      organizationId = data.id as string;
      break;
    }
    if (error && !error.message.includes("organizations_slug_key")) {
      return { error: "The workspace could not be created. Try again." };
    }
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  if (!organizationId) {
    return { error: "Could not find an available workspace name. Try a different one." };
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) {
    return { error: "The workspace was created but access could not be granted." };
  }

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id);

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
