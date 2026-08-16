"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Input, Label } from "@/components/ui/primitives";
import type { AuthState } from "@/lib/auth/actions";

export function OnboardingForm({
  action,
  defaultUsername,
  defaultDisplayName,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  defaultUsername: string;
  defaultDisplayName: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <Card>
      <CardBody className="p-5">
        <h1 className="text-[16px] font-semibold">Set up your workspace</h1>
        <p className="mt-1 mb-4 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
          A workspace holds your datasets, dashboards and team. You can invite
          people later.
        </p>

        {state?.error ? (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-md border border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] px-3 py-2 text-[12px] text-[var(--nx-error-fg)]"
          >
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <form action={formAction} className="space-y-3">
          <div>
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              name="displayName"
              required
              defaultValue={defaultDisplayName}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_]+"
              defaultValue={defaultUsername}
              placeholder="jane_doe"
            />
            <p className="mt-1 text-[11px] text-[var(--nx-text-faint)]">
              Lowercase letters, numbers and underscores. Used for signing in.
            </p>
          </div>
          <div>
            <Label htmlFor="workspaceName">Workspace name</Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              required
              placeholder="Acme Analytics"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
