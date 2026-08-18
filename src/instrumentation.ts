import type { Instrumentation } from "next";

/**
 * Central place uncaught server errors pass through — Server Components,
 * Route Handlers, Server Actions and the proxy all funnel here.
 *
 * Individual call sites already log locally (see `[audit]` and `[proxy]` in
 * the codebase), but nothing previously aggregated *unhandled* failures: a
 * route that threw before reaching its own try/catch left no trace beyond
 * whatever Vercel's raw stdout capture happened to keep. This gives every
 * server error one structured line — greppable by route and by digest — and,
 * on the Node runtime, a row in the same `audit_logs` table auth events
 * already use, so a spike in `api.error` is visible next to a spike in
 * `auth.login_failed` instead of being a separate investigation.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  console.error(
    `[server-error] ${context.routerKind} ${context.routeType} ${context.routePath} ${request.method} ${request.path}` +
      (digest ? ` digest=${digest}` : "") +
      ` — ${message}`,
  );

  // File-backed local mode and the Supabase admin client both need Node
  // APIs; skip the audit write on the Edge runtime rather than risk pulling
  // an incompatible module into that bundle. The console line above still
  // fires everywhere.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const headerValue = (name: string): string | undefined => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };

    const { audit } = await import("@/lib/store");
    await audit({
      organization_id: null,
      user_id: null,
      action: "api.error",
      resource_type: context.routeType,
      resource_id: context.routePath,
      ip_address: headerValue("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: headerValue("user-agent"),
      metadata: {
        method: request.method,
        path: request.path,
        message,
        digest,
      },
    });
  } catch {
    // audit() already swallows and logs its own failures; a throw here
    // would only mean the dynamic import itself failed, which is not worth
    // taking the request down for.
  }
};
