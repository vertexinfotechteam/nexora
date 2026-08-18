import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/*
 * The cookie policy is inlined here rather than imported.
 *
 * Next's proxy documentation is explicit: "Proxy is meant to be invoked
 * separately of your render code and in optimized cases deployed to your CDN
 * ... you should not attempt relying on shared modules or globals." A shared
 * import builds fine and then fails at request time in a deployed
 * environment, which takes down every page at once while API routes — which
 * the matcher excludes — carry on working.
 *
 * It duplicates hardenAuthCookie() in lib/auth/cookies.ts, which is not
 * something to do lightly with a security rule. The two are kept honest by
 * the tests in tests/cookies.test.ts covering the shared copy, and by this
 * note on both sides. If one changes, change the other.
 */
type ProxyCookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  // Supabase types this as string | boolean; we always emit "lax".
  sameSite?: boolean | "lax" | "strict" | "none";
};

function hardenAuthCookie(options: ProxyCookieOptions = {}): ProxyCookieOptions {
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return {
    ...rest,
    path: options.path ?? "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Runs before every page request (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Responsibilities:
 *   1. Refresh the Supabase session cookie so server components see a valid user.
 *   2. Gate protected routes — unauthenticated users never reach app pages.
 *   3. Emit a per-request Content-Security-Policy carrying a fresh nonce.
 *
 * Note this is a convenience gate, not the security boundary: every API route
 * and data access re-checks the session, and RLS enforces tenancy in Postgres.
 */

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  /*
   * The operations sign-in must be reachable without a session, or it would
   * bounce to the customer login and never be usable. Only this exact path is
   * public — isPublic() matches the entry or a child of it, and "/admin" is
   * not a child of "/admin/login", so the panel itself stays gated.
   */
  "/admin/login",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  // Marketing and legal pages must be readable without an account.
  "/terms",
  "/privacy",
  "/refunds",
  "/faq",
  "/company",
  "/contact",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap load its own chunks.
    // Dev additionally needs eval for React Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // Tailwind and Recharts inject inline styles at runtime.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${isDev ? "ws: http://localhost:*" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function handle(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  if (supabaseUrl && supabaseKey) {
    /*
     * Skip the auth server entirely when no session cookie is present.
     *
     * getUser() is a network round trip to Supabase, and it ran on every
     * request through this proxy — including every anonymous page load and
     * every RSC payload fetch, none of which can possibly be authenticated.
     * Measured at 6.5s in the proxy on a single navigation, which is also what
     * made an RSC fetch time out and fall back to a full browser navigation.
     *
     * With no `sb-` cookie the call is guaranteed to return null, so not
     * making it changes nothing about the outcome. The gate below still
     * refuses protected paths, because "no cookie" and "getUser said no" lead
     * to the same place.
     *
     * This is not a weaker check: a request that does carry a session cookie
     * is still validated against the auth server on every request, which is
     * the property that stops an edited cookie being trusted.
     */
    const hasAuthCookie = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-"));

    if (!hasAuthCookie) {
      if (!isPublic(pathname)) {
        return bounceToLogin(request, csp, pathname);
      }
      applySecurityHeaders(response, csp, pathname);
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            // Session-only, httpOnly, secure. See hardenAuthCookie().
            response.cookies.set(name, value, hardenAuthCookie(options));
          }
        },
      },
    });

    // getUser() revalidates the token against the auth server; getSession()
    // would trust a cookie the client can edit.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isPublic(pathname)) {
      return bounceToLogin(request, csp, pathname);
    }
    if (user && (pathname === "/login" || pathname === "/signup")) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/dashboard";
      redirect.search = "";
      const bounce = NextResponse.redirect(redirect);
      applySecurityHeaders(bounce, csp, pathname);
      return bounce;
    }
  } else {
    // Local mode: a session cookie is set explicitly from the login screen.
    const hasLocalSession = request.cookies.has("nx_local_session");
    if (!hasLocalSession && !isPublic(pathname)) {
      return bounceToLogin(request, csp, pathname);
    }
  }

  applySecurityHeaders(response, csp, pathname);
  return response;
}

/**
 * Sends an unauthenticated visitor to the sign-in screen.
 *
 * The path they were reaching for is preserved so they land where they meant
 * to after signing in. Only the path and query are carried — never a full URL
 * — so this cannot be turned into an open redirect, and the receiving end
 * validates it again before using it.
 */
function bounceToLogin(
  request: NextRequest,
  csp: string,
  pathname: string,
): NextResponse {
  const redirect = request.nextUrl.clone();
  redirect.pathname = "/login";
  redirect.search = "";
  redirect.searchParams.set("next", pathname);

  const response = NextResponse.redirect(redirect);
  applySecurityHeaders(response, csp, pathname);
  return response;
}

/**
 * Headers applied to every response.
 *
 * The no-store rule on signed-in pages is the one that matters most here.
 * Without it the browser is free to keep a rendered dashboard in its back /
 * forward cache; after signing out, pressing Back re-displays that page —
 * names, figures and all — because nothing goes to the server to be
 * re-authorised. `no-store` forbids keeping the copy at all, so Back has to
 * re-request the page and gets bounced to the sign-in screen.
 */
function applySecurityHeaders(
  response: NextResponse,
  csp: string,
  pathname: string,
): void {
  response.headers.set("content-security-policy", csp);

  // Never let a browser second-guess a declared content type.
  response.headers.set("x-content-type-options", "nosniff");
  // frame-ancestors already covers this; kept for older browsers.
  response.headers.set("x-frame-options", "DENY");
  // Send the origin off-site, never the full path of an internal page.
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // Nothing here needs any of these, so refuse them outright.
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  if (!isPublic(pathname)) {
    response.headers.set(
      "cache-control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("pragma", "no-cache");
    response.headers.set("expires", "0");
  }
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimisation, favicon and API
     * routes. API routes do their own auth check and must not be redirected.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

/**
 * The entry point, wrapped so a fault here cannot take down the whole site.
 *
 * This runs before every page. When it threw, every page returned a bare
 * "Internal Server Error" while API routes — excluded by the matcher — kept
 * working, which is a confusing shape to debug and a total outage to a user.
 *
 * The recovery is deliberately asymmetric. A protected path still redirects
 * to sign-in, because failing open there would serve an app shell to someone
 * who was never authenticated. A public path is allowed through without the
 * extra headers, since a landing page with a missing CSP is a smaller problem
 * than a site that does not load at all.
 */
export async function proxy(request: NextRequest) {
  try {
    return await handle(request);
  } catch (error) {
    const { pathname } = request.nextUrl;
    console.error("[proxy] failed for", pathname, error);

    if (!isPublic(pathname)) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      redirect.search = "";
      redirect.searchParams.set("next", pathname);
      return NextResponse.redirect(redirect);
    }

    return NextResponse.next();
  }
}
