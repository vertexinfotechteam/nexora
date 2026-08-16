import type { CookieOptions } from "@supabase/ssr";

/**
 * How auth cookies are allowed to be written.
 *
 * Supabase proposes its own options when it sets a session cookie; every one
 * of them passes through here first, so the policy lives in a single place
 * rather than at each of the call sites that happen to persist a session.
 */

/** Cookies matching these names carry the session and must follow the policy. */
export function isAuthCookie(name: string): boolean {
  return name.startsWith("sb-") || name === "nx_local_session";
}

/**
 * Forces a session cookie: no `maxAge`, no `expires`.
 *
 * A cookie with neither lives only as long as the browser session, so closing
 * the window ends the session and the next visit lands on the sign-in screen.
 * Supabase would otherwise set a long-lived refresh cookie that survives a
 * restart and leaves the dashboard reachable on a shared machine.
 *
 * Also pins the flags that make the cookie hard to steal or replay:
 *   - httpOnly  keeps the token out of reach of any script on the page, so an
 *               XSS bug cannot read it. Nothing in this app reads auth cookies
 *               from JavaScript.
 *   - secure    refuses to travel over plain HTTP outside development.
 *   - sameSite  'lax' stops the cookie riding along with cross-site POSTs,
 *               which is what makes CSRF against the server actions hard,
 *               while still allowing a normal link into the app.
 */
export function hardenAuthCookie(options: CookieOptions = {}): CookieOptions {
  const {
    maxAge: _maxAge,
    expires: _expires,
    ...rest
  } = options;

  return {
    ...rest,
    path: options.path ?? "/",
    httpOnly: true,
    sameSite: "lax",
    // localhost is not a secure origin for cookie purposes during development.
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Options for deleting a cookie.
 *
 * A cookie is only replaced when the name, path and domain all match, so a
 * deletion has to repeat the attributes it was written with — otherwise the
 * browser keeps the original and the user stays signed in.
 */
export function expiredAuthCookie(): CookieOptions {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
  };
}
