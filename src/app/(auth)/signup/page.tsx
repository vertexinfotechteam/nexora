import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import { oauthSignInAction, signUpAction } from "@/lib/auth/actions";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  async function startOauth(formData: FormData) {
    "use server";
    await oauthSignInAction(null, formData);
  }

  return (
    <SignupForm
      action={signUpAction}
      oauthAction={startOauth}
      supabaseConfigured={isSupabaseConfigured()}
    />
  );
}
