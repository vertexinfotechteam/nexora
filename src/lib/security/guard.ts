import "server-only";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { check, identify, limitHeaders, type LimitName } from "./rate-limit";

/**
 * The one call an API route makes to be throttled.
 *
 * Returns a ready 429 when the caller is over budget, or null when they are
 * not — so a route reads:
 *
 *   const limited = await enforceLimit("ai", session.userId);
 *   if (limited) return limited;
 *
 * Nothing else about the route changes, which is the point: this adds a
 * refusal path for abuse and leaves the success path untouched.
 */
export async function enforceLimit(
  name: LimitName,
  userId?: string | null,
): Promise<NextResponse | null> {
  const headerList = await headers();
  const result = check(name, identify(headerList, userId));

  if (result.allowed) return null;

  return NextResponse.json(
    {
      error:
        "That is more requests than this endpoint accepts in a short period. Wait a moment and try again.",
      retryAfter: result.retryAfter,
    },
    { status: 429, headers: limitHeaders(name, result) },
  );
}

/**
 * The same check for a server action, which cannot return a Response.
 *
 * Throws nothing — the caller decides what a refusal looks like in its own
 * shape, because an action's error type is part of its contract with the form
 * that calls it.
 */
export async function limitAction(
  name: LimitName,
  userId?: string | null,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const headerList = await headers();
  const result = check(name, identify(headerList, userId));
  return { allowed: result.allowed, retryAfter: result.retryAfter };
}
