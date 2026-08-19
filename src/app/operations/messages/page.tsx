import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { can } from "@/lib/admin/rbac";
import { listContactMessages } from "@/lib/contact";
import { ContactMessages } from "@/components/admin/contact-messages";

export const dynamic = "force-dynamic";

/** Everything submitted through the contact form on the marketing site. */
export default async function MessagesPage() {
  const session = await getSession();
  const staff = session ? await getStaffMember(session) : null;

  if (!staff || !can(staff.role, "tickets.read")) {
    return (
      <p className="text-[13px] text-[var(--nx-text-muted)]">
        Your role does not include reading messages.
      </p>
    );
  }

  const messages = session ? await listContactMessages(session, 100) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Messages</h1>
        <p className="mt-0.5 text-[12.5px] text-[var(--nx-text-muted)]">
          Everything submitted through the contact form on the marketing site.
        </p>
      </div>
      <ContactMessages initial={messages} />
    </div>
  );
}
