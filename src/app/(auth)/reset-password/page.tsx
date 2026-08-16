import type { Metadata } from "next";
import { updatePasswordAction } from "@/lib/auth/actions";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "New password" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm action={updatePasswordAction} />;
}
