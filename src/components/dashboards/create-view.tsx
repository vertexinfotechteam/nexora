"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createViewAction } from "@/app/(app)/dashboards/actions";

/** Creates a saved view and opens it, so the next step is obvious. */
export function CreateView() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="accent" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        New view
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await createViewAction(name);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          setName("");
          setOpen(false);
          if (result.id) router.push(`/dashboards/${result.id}`);
        });
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Weekly sales"
        maxLength={80}
        className="h-8 w-44 rounded-md border border-[var(--nx-border)] bg-[var(--nx-card)] px-2 text-[12.5px] outline-none focus:border-[var(--nx-accent)]"
      />
      <Button size="sm" variant="accent" type="submit" disabled={pending || !name.trim()}>
        {pending ? "Creating…" : "Create"}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
