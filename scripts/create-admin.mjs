/**
 * Creates the first workspace owner (admin) account.
 *
 *   node scripts/create-admin.mjs <email> <password> [business name]
 *
 * Uses the service key's admin API, so the account is created with its email
 * already confirmed. That sidesteps the confirmation email entirely — which
 * matters because Supabase's built-in mailer allows only a few messages an hour
 * and will refuse to send once that is used up.
 *
 * The account gets the `owner` role in a new organization, which is what the
 * admin panel checks. There is no separate admin login: the admin panel is
 * gated on your role, not on a second set of credentials.
 *
 * Requires the migration to have been run first.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const [, , emailArg, passwordArg, businessArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error(
    "\nUsage: node scripts/create-admin.mjs <email> <password> [business name]\n\n" +
      "Password must be at least 10 characters with an upper case letter,\n" +
      "a lower case letter and a number.\n",
  );
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;
const businessName = (businessArg ?? "My Workspace").trim();

if (
  password.length < 10 ||
  !/[a-z]/.test(password) ||
  !/[A-Z]/.test(password) ||
  !/[0-9]/.test(password)
) {
  console.error(
    "\nThat password would be rejected by the sign-in form.\n" +
      "Use at least 10 characters with upper case, lower case and a number.\n",
  );
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SECRET) {
  console.error("\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local\n");
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "workspace";

console.log("\nCreating owner account\n");

// --- 0. schema present? ----------------------------------------------------
{
  const { error } = await admin.from("profiles").select("id").limit(1);
  if (error && /schema cache|does not exist|PGRST205/i.test(`${error.code} ${error.message}`)) {
    console.error(
      "  ✗ The database tables do not exist yet.\n\n" +
        "    Run supabase/migrations/0001_nexora_init.sql in the Supabase SQL\n" +
        "    Editor first, then run this script again.\n",
    );
    process.exit(1);
  }
}

// --- 1. auth user ----------------------------------------------------------
let userId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Already there from a previous attempt: reuse it and reset the password
    // so the credentials printed at the end are always the working ones.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) {
      console.error(`  ✗ Could not create the user: ${error.message}\n`);
      process.exit(1);
    }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    console.log("  ✓ auth user already existed — password reset");
  } else {
    userId = data.user.id;
    console.log("  ✓ auth user created (email pre-confirmed)");
  }
}

// --- 2. profile ------------------------------------------------------------
const baseUsername =
  email.split("@")[0].replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) ||
  "admin";
const username = baseUsername.length >= 3 ? baseUsername : `${baseUsername}_user`;

{
  const { error } = await admin.from("profiles").upsert(
    {
      user_id: userId,
      username,
      display_name: businessName,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error(`  ✗ Could not write the profile: ${error.message}\n`);
    process.exit(1);
  }
  console.log(`  ✓ profile created (username: ${username})`);
}

// --- 3. organization -------------------------------------------------------
let organizationId;
{
  const { data: existing } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    organizationId = existing.organization_id;
    console.log("  ✓ already a member of a workspace");
  } else {
    let slug = slugify(businessName);
    for (let attempt = 0; attempt < 5 && !organizationId; attempt++) {
      const { data, error } = await admin
        .from("organizations")
        .insert({
          id: randomUUID(),
          name: businessName,
          slug,
          created_by: userId,
          plan: "enterprise",
        })
        .select("id")
        .single();

      if (!error && data) {
        organizationId = data.id;
        break;
      }
      if (error && !/slug/i.test(error.message)) {
        console.error(`  ✗ Could not create the workspace: ${error.message}\n`);
        process.exit(1);
      }
      slug = `${slugify(businessName)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    console.log(`  ✓ workspace created: ${businessName}`);
  }
}

// --- 4. owner membership ---------------------------------------------------
{
  const { error } = await admin.from("organization_members").upsert(
    { organization_id: organizationId, user_id: userId, role: "owner" },
    { onConflict: "organization_id,user_id" },
  );
  if (error) {
    console.error(`  ✗ Could not grant the owner role: ${error.message}\n`);
    process.exit(1);
  }
  console.log("  ✓ owner role granted (this is what unlocks the admin panel)");
}

console.log(`
Done. Sign in at http://localhost:3000/login

  Email     ${email}
  Username  ${username}
  Password  the one you passed to this script

The admin panel is at /admin. It is gated on your workspace role, so this
account reaches it because it is the owner — there is no separate admin login.
`);
