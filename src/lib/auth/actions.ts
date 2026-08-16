"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, SITE_URL } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSchemaReady, SCHEMA_MISSING_MESSAGE } from "@/lib/supabase/health";
import { audit } from "@/lib/store";
import { LOCAL_IDENTITY } from "@/lib/store/local";
import { LOCAL_SESSION_COOKIE } from "./session";
import { hardenAuthCookie } from "./cookies";
import { resolveSiteOrigin, safeNextPath } from "./redirect";
import { provisionWorkspace } from "./provision";

/**
 * Authentication server actions.
 *
 * Two rules that shape everything here:
 *   1. Passwords are never stored or handled by this application — Supabase
 *      Auth owns them entirely. We only ever pass them straight through.
 *   2. Errors are deliberately generic. Neither login nor password reset
 *      reveals whether an account, email or username exists.
 */

const GENERIC_CREDENTIALS_ERROR =
  "Those credentials are not valid. Check them and try again.";

export type AuthState = { error?: string; success?: string } | null;

/** Matches the rule stated under the field, so the UI never promises something
 *  the server does not enforce. */
const passwordSchema = z
  .string()
  .min(7, "Password must be at least 7 characters.")
  .max(200, "Password is too long.")
  .regex(/[a-z]/, "Password must include a lower case letter.")
  .regex(/[A-Z]/, "Password must include an upper case letter.")
  .regex(/[0-9]/, "Password must include a number.");

const signupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name.").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z.literal("on", {
      errorMap: () => ({
        message: "Please accept the terms of service and privacy policy.",
      }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * Builds a username from the email local part.
 *
 * The sign-up form does not ask for one — the design has no field for it — but
 * username sign-in still needs a value, so it is derived here and made unique
 * with a short suffix if taken.
 */
async function deriveUsername(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "user";

  const padded = base.length >= 3 ? base : `${base}_user`;

  if (!hasServiceClient()) return padded;

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate =
      attempt === 0 ? padded : `${padded}_${Math.random().toString(36).slice(2, 6)}`;
    const { data: available } = await getServiceClient().rpc(
      "username_available",
      { p_username: candidate },
    );
    if (available !== false) return candidate;
  }
  return `${padded}_${Date.now().toString(36).slice(-5)}`;
}

/**
 * Origin for links we email to a user. Never the request's Origin header —
 * see resolveSiteOrigin().
 */
async function siteOrigin(): Promise<string> {
  return resolveSiteOrigin(
    SITE_URL,
    (await headers()).get("origin"),
    process.env.NODE_ENV === "production",
  );
}

async function requestContext() {
  const headerList = await headers();
  return {
    ip_address:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    user_agent: headerList.get("user-agent") ?? undefined,
  };
}

/** Looks like an email address rather than a username. */
function isEmail(value: string): boolean {
  return value.includes("@");
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Sign-up needs a Supabase project. Add your Supabase URL and keys to .env.local, or continue in local mode from the sign-in page.",
    };
  }

  // Auth would happily create the user and then fail on the next step with an
  // opaque "relation does not exist". Check first and name the real problem.
  if (!(await isSchemaReady())) {
    return { error: SCHEMA_MISSING_MESSAGE };
  }

  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptedTerms: formData.get("acceptedTerms"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { fullName, email, password } = parsed.data;
  /*
   * Sign-up does not ask for a business or workspace name — the only thing
   * between someone and their dashboard is an email and a password. The name
   * still exists because it is what gets printed on invoices and reports, so
   * it starts as the person's own name (which is correct as-is for a sole
   * trader) and is changed in Settings > Branding, next to the logo and
   * signature it will sit beside.
   */
  const businessName = fullName;
  const context = await requestContext();
  const username = await deriveUsername(email);

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Authentication is not available." };

  /*
   * Account creation goes through the admin API rather than auth.signUp().
   *
   * signUp() always tries to send a confirmation email, and Supabase's shared
   * mailer allows only a handful per hour before returning 429. That makes the
   * single most important flow in the product fail for reasons that have
   * nothing to do with the user. Creating the account server-side with the
   * email already marked confirmed removes that dependency entirely.
   *
   * Set NEXUS_REQUIRE_EMAIL_CONFIRMATION=true once real SMTP is configured to
   * go back to the emailed-link flow.
   */
  if (requiresEmailConfirmation()) {
    const origin = await siteOrigin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
        data: { username, full_name: fullName, business_name: businessName },
      },
    });

    if (error) {
      await audit({
        organization_id: null,
        user_id: null,
        action: "auth.signup_failed",
        metadata: { reason: error.message },
        ...context,
      });
      if (error.status === 429 || /rate limit/i.test(error.message)) {
        return {
          error:
            "Too many confirmation emails have been sent in the last hour. Please try again shortly.",
        };
      }
      return { error: signupFailureMessage(error.message) };
    }

    if (!data.session) {
      return {
        success:
          "Check your email to confirm your address, then sign in. The link expires in 24 hours.",
      };
    }
  } else {
    if (!hasServiceClient()) {
      return {
        error:
          "Sign-up is not available: SUPABASE_SERVICE_ROLE_KEY is missing from the server configuration.",
      };
    }

    const { error: createError } = await getServiceClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName, business_name: businessName },
    });

    if (createError) {
      await audit({
        organization_id: null,
        user_id: null,
        action: "auth.signup_failed",
        metadata: { reason: createError.message },
        ...context,
      });
      return { error: signupFailureMessage(createError.message) };
    }

    // Establish the session on the user's own client so cookies are set.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return {
        success:
          "Your account was created. Please sign in with your email and password.",
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success:
        "Your account was created. Please sign in with your email and password.",
    };
  }

  await audit({
    organization_id: null,
    user_id: user.id,
    action: "auth.signup",
    metadata: { username, businessName },
    ...context,
  });

  const created = await provisionWorkspaceForSignup({
    userId: user.id,
    username,
    fullName,
    businessName,
  });

  // Either way the dashboard is next; the app layout provisions a workspace
  // if this call did not manage to.
  void created;
  redirect("/dashboard");
}

/** True when the project should use the emailed confirmation-link flow. */
function requiresEmailConfirmation(): boolean {
  return (process.env.NEXUS_REQUIRE_EMAIL_CONFIRMATION ??
    process.env.NEXORA_REQUIRE_EMAIL_CONFIRMATION) === "true";
}

/**
 * Turns a provider error into something a user can act on, without confirming
 * whether a given address is registered.
 */
function signupFailureMessage(providerMessage: string): string {
  if (/already (been )?registered|already exists|duplicate/i.test(providerMessage)) {
    // Safe to be specific: the user is looking at their own address, and the
    // sign-in page would tell them the same thing.
    return "An account already exists for that email address. Sign in instead, or use Forgot password.";
  }
  if (/invalid/i.test(providerMessage) && /email/i.test(providerMessage)) {
    return "That email address was rejected as invalid. Use a real address you can receive mail at.";
  }
  if (/password/i.test(providerMessage)) {
    return "That password was rejected. Use at least 7 characters with upper case, lower case and a number.";
  }
  return `Your account could not be created: ${providerMessage}`;
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  const context = await requestContext();

  if (!identifier || !password) {
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  if (!isSupabaseConfigured()) {
    return {
      error:
        "Supabase is not connected, so there are no accounts to sign in to. Use 'Continue in local mode' below.",
    };
  }

  if (!(await isSchemaReady())) {
    return { error: SCHEMA_MISSING_MESSAGE };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: GENERIC_CREDENTIALS_ERROR };

  let email = identifier.toLowerCase();

  // Username login: resolve to an email on the server. The RPC is granted to
  // service_role only, and returns null for unknown usernames so this path
  // cannot be used to discover which accounts exist.
  if (!isEmail(identifier)) {
    if (!hasServiceClient()) {
      return {
        error:
          "Username sign-in needs SUPABASE_SERVICE_ROLE_KEY to be configured. Sign in with your email address instead.",
      };
    }
    const { data: resolved } = await getServiceClient().rpc(
      "email_for_username",
      { p_username: identifier.toLowerCase() },
    );
    if (!resolved) {
      await audit({
        organization_id: null,
        user_id: null,
        action: "auth.login_failed",
        metadata: { reason: "unknown_identifier" },
        ...context,
      });
      return { error: GENERIC_CREDENTIALS_ERROR };
    }
    email = String(resolved);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await audit({
      organization_id: null,
      user_id: null,
      action: "auth.login_failed",
      metadata: { reason: "bad_credentials" },
      ...context,
    });
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  await audit({
    organization_id: null,
    user_id: data.user.id,
    action: "auth.login",
    ...context,
  });

  // No workspace step: the app layout creates one on first load if missing.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  void membership;
  redirect(safeNextPath(next));
}


export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const context = await requestContext();

  // Always the same answer, whether or not the address exists.
  const genericSuccess = {
    success:
      "If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.",
  };

  if (!isSupabaseConfigured() || !email.includes("@")) return genericSuccess;

  const supabase = await getServerSupabase();
  if (!supabase) return genericSuccess;

  const origin = await siteOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  await audit({
    organization_id: null,
    user_id: null,
    action: "auth.password_reset_requested",
    ...context,
  });

  return genericSuccess;
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({ password: passwordSchema, confirmPassword: z.string() })
    .refine((data) => data.password === data.confirmPassword, {
      message: "The two passwords do not match.",
    })
    .safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Authentication is not available." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      error: "This reset link is no longer valid. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: "The password could not be updated. Request a new link." };

  await audit({
    organization_id: null,
    user_id: userData.user.id,
    action: "auth.password_changed",
    ...(await requestContext()),
  });

  redirect("/login?reset=1");
}

/** Enables local mode without Supabase. Only offered when Supabase is absent. */
export async function startLocalSessionAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    throw new Error("Local mode is unavailable once Supabase is connected.");
  }
  const store = await cookies();
  // Session-only, like the Supabase cookies: this used to last 30 days, which
  // meant closing the browser did not end the session.
  store.set(LOCAL_SESSION_COOKIE, crypto.randomUUID(), hardenAuthCookie());

  await audit({
    organization_id: LOCAL_IDENTITY.organizationId,
    user_id: LOCAL_IDENTITY.userId,
    action: "auth.local_session_started",
  });

  redirect("/dashboard");
}

/* -------------------------------------------------------------------------- */
/* OAuth                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Starts a Google or GitHub sign-in.
 *
 * Supabase owns the whole exchange — we only ask it for the provider's
 * authorisation URL and send the browser there. If the provider has not been
 * enabled in the Supabase dashboard, Supabase returns an error and we surface
 * it plainly rather than bouncing the user to a broken page.
 */
export async function oauthSignInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "google" && provider !== "github") {
    return { error: "Unknown sign-in provider." };
  }

  if (!isSupabaseConfigured()) {
    return {
      error:
        "Social sign-in needs a connected Supabase project. Use 'Continue in local mode' below, or add your Supabase keys to .env.local.",
    };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Authentication is not available." };

  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      // Supabase returns the URL instead of redirecting, because the redirect
      // has to happen from the browser, not from this server action.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    await audit({
      organization_id: null,
      user_id: null,
      action: "auth.oauth_failed",
      metadata: { provider, reason: error?.message ?? "no_url" },
      ...(await requestContext()),
    });
    return {
      error: `${provider === "google" ? "Google" : "GitHub"} sign-in is not enabled on this project yet. Enable it under Authentication → Providers in Supabase.`,
    };
  }

  redirect(data.url);
}

/* -------------------------------------------------------------------------- */
/* Workspace provisioning                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Creates the profile, organization and owner membership in one step.
 *
 * Ordering matters for RLS: the organization must exist with created_by set to
 * the caller before the owner membership row can pass its insert policy.
 *
 * Returns false when anything fails, in which case the caller sends the user to
 * the dashboard, where the layout provisions one, rather than leaving them in limbo.
 */
/**
 * Creates the workspace immediately after sign-up, when the project has email
 * confirmation switched off and a session already exists.
 *
 * Delegates to the shared privileged helper rather than writing the rows with
 * the user client, which cannot satisfy the RLS bootstrap ordering.
 */
async function provisionWorkspaceForSignup(input: {
  userId: string;
  username: string;
  fullName: string;
  businessName: string;
}): Promise<boolean> {
  const result = await provisionWorkspace({
    userId: input.userId,
    username: input.username,
    displayName: input.fullName,
    businessName: input.businessName,
  });

  if (!result.ok) {
    console.error("[signup] workspace provisioning failed:", result.error);
    return false;
  }

  if (result.created) {
    await audit({
      organization_id: result.organizationId,
      user_id: input.userId,
      action: "workspace.created",
      resource_type: "organization",
      resource_id: result.organizationId,
      metadata: { name: input.businessName, source: "signup" },
    });
  }

  return true;
}
