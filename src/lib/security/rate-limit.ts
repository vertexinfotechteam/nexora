import "server-only";

/**
 * Request throttling.
 *
 * One in-process limiter, shared by every caller, replacing the two ad-hoc
 * maps that had grown up in the contact form and the operations sign-in.
 *
 * What this is: a fixed-window counter held in memory. It stops a script
 * hammering an endpoint from one address, which is the abuse that actually
 * shows up.
 *
 * What this is not: distributed. Each server instance keeps its own counters,
 * so behind N instances the effective limit is N times the configured one, and
 * a restart forgets everything. Saying so here rather than letting someone
 * discover it during an incident — if this ever runs on more than one
 * instance, the counters belong in Redis or at the edge, and only this file
 * needs to change.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records a hit and reports whether it is allowed.
 *
 * `key` must already identify the caller — see identify(). Callers that mean
 * to limit per-account should pass the user id, not the address, or everyone
 * behind one office NAT shares a budget.
 */
export function hit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfter };
}

/**
 * The limits, named after what they protect.
 *
 * Chosen so a person working normally never meets them. The AI budget is the
 * tightest because each call costs real money and real time; the read budget
 * is loose because a dashboard legitimately makes several requests at once.
 */
export const LIMITS = {
  /** Sign-in. Tight: password guessing is the whole threat. */
  login: { limit: 10, windowMs: 15 * 60_000 },
  /** Operations sign-in. Tighter still — staff are few. */
  adminLogin: { limit: 8, windowMs: 15 * 60_000 },
  /** Account creation, to stop scripted signup floods. */
  signup: { limit: 5, windowMs: 60 * 60_000 },
  /** Password reset, which sends mail on someone else's behalf. */
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  /** Public contact form. */
  contact: { limit: 5, windowMs: 10 * 60_000 },
  /** Anything that calls a model or runs an analysis. */
  ai: { limit: 20, windowMs: 60_000 },
  /** File upload. */
  upload: { limit: 30, windowMs: 60_000 },
  /** Export generation, which is CPU-heavy. */
  export: { limit: 30, windowMs: 60_000 },
  /** Ordinary reads. Loose — one page can legitimately fire several. */
  read: { limit: 240, windowMs: 60_000 },
  /** Anonymous access to a shared link, the scraping surface. */
  sharedLink: { limit: 60, windowMs: 60_000 },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * Applies a named limit.
 *
 * The bucket is namespaced by limit name, so exhausting the AI budget does not
 * also lock the caller out of reading a page.
 */
export function check(name: LimitName, identifier: string): RateLimitResult {
  const { limit, windowMs } = LIMITS[name];
  const result = hit(`${name}:${identifier}`, limit, windowMs);

  // Logged once per window, on the request that first goes over — not on
  // every request after, which would just turn the flood itself into a
  // second flood in the logs. One line per breach is enough to alert on or
  // graph; the count is already in `audit_logs` via api.error for anything
  // downstream that also errors.
  if (!result.allowed && result.remaining === 0 && result.retryAfter > 0) {
    const bucket = buckets.get(`${name}:${identifier}`);
    if (bucket && bucket.count === limit + 1) {
      console.warn(
        `[rate-limit] ${name} exceeded by ${identifier} — limit ${limit} per ${windowMs}ms`,
      );
    }
  }

  return result;
}

/**
 * Who to count against.
 *
 * A signed-in user is counted by account, so a shared office address does not
 * put colleagues in one another's budget. Anonymous callers fall back to the
 * forwarded address.
 *
 * `x-forwarded-for` is only as trustworthy as the proxy in front of the app.
 * Behind a proxy that appends rather than replaces, the first entry is the
 * client; with no trusted proxy at all it can be forged, which is why this is
 * a throttle and not an authorisation control.
 */
export function identify(
  headers: Headers,
  userId?: string | null,
): string {
  if (userId) return `user:${userId}`;

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return `ip:${forwarded || real || "unknown"}`;
}

/** Headers describing the outcome, for a 429 response. */
export function limitHeaders(
  name: LimitName,
  result: RateLimitResult,
): Record<string, string> {
  return {
    "retry-after": String(result.retryAfter),
    "x-ratelimit-limit": String(LIMITS[name].limit),
    "x-ratelimit-remaining": String(result.remaining),
  };
}
