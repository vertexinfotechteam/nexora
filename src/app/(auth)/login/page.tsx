import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import {
  oauthSignInAction,
  signInAction,
  startLocalSessionAction,
} from "@/lib/auth/actions";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  const resetDone = params.reset === "1";

  // The OAuth action is bound here so the client component receives a plain
  // form action rather than needing the two-argument useActionState shape.
  async function startOauth(formData: FormData) {
    "use server";
    await oauthSignInAction(null, formData);
  }

  return (
    <LoginForm
      action={signInAction}
      oauthAction={startOauth}
      localModeAction={startLocalSessionAction}
      supabaseConfigured={isSupabaseConfigured()}
      next={next}
      resetDone={resetDone}
    />
  );
}
