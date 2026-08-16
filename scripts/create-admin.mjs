/**
 * Creates an account and its workspace.
 *
 *   node scripts/create-admin.mjs <email> [business name]
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or typed
 * at the prompt if that is not set. It is deliberately not a command-line
 * argument: anything passed that way lands in your shell history and is
 * visible to other processes on the machine while the script runs.
 *
 * Uses the service key's admin API, so the account is created with its email
 * already confirmed. That sidesteps the confirmation email entirely — which
 * matters because Supabase's built-in mailer allows only a few messages an hour
 * and will refuse to send once that is used up.
 *
 * NOTE: this does not by itself grant the admin panel. That is gated on
 * platform staff — NEXUS_PLATFORM_ADMIN_EMAILS, or a row in platform_staff —
 * and not on a workspace role, because every user owns their own workspace and
 * a workspace role could never be the gate.
 *
 * Requires the migration to have been run first.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";

const [, , emailArg, businessArg] = process.argv;

if (!emailArg) {
  console.error(
    "\nUsage: node scripts/create-admin.mjs <email> [business name]\n\n" +
      "The password comes from ADMIN_PASSWORD, or is typed at the prompt.\n" +
      "It must be at least 10 characters with an upper case letter,\n" +
      "a lower case letter and a number.\n",
  );
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();

const password = await (async () => {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Password for ${email}: `);
  rl.close();
  return answer;
})();

if (!password) {
  console.error("\nNo password given.\n");
  process.exit(1);
}

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
  console.log("  ✓ owner role granted in this workspace");
}

// --- 5. is this account platform staff? ------------------------------------
/*
 * Owning a workspace is not what opens the admin panel, and saying otherwise
 * is how someone ends up staring at a "for platform staff" screen wondering
 * what went wrong. Check the actual gate and report it.
 */
const staffList = (env.NEXUS_PLATFORM_ADMIN_EMAILS ?? env.NEXORA_PLATFORM_ADMIN_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const isStaff = staffList.includes(email);

console.log(`
Done. Sign in at http://localhost:3000/login

  Email     ${email}
  Username  ${username}
  Password  the one you just entered
`);

if (isStaff) {
  console.log(`This account is platform staff, so /admin is open to it.\n`);
} else {
  console.log(
    `This account is NOT platform staff, so /admin will refuse it.\n` +
      `The admin panel is gated on who operates Nexus, not on who owns a\n` +
      `workspace — every user owns one, so a workspace role cannot be the gate.\n\n` +
      `To grant it, add the address to .env.local and restart the server:\n\n` +
      `  NEXUS_PLATFORM_ADMIN_EMAILS=${[...staffList, email].join(",")}\n`,
  );
}
