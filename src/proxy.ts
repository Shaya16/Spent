import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Next 16's request interceptor (formerly "middleware"). It does two jobs:
//   1. Same-origin enforcement for mutating /api requests (CSRF guard).
//   2. next-intl locale routing for page requests (adds the /en or /he prefix).

const handleI18nRouting = createMiddleware(routing);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Same-origin enforcement for mutating API requests.
 *
 * Spent runs on 127.0.0.1 only, but any webpage you visit can fire a POST
 * to http://127.0.0.1:3000/api/sync from inside your browser. This rejects
 * state-changing requests whose Origin or Referer isn't the app itself, so a
 * malicious tab can't trick your localhost into syncing, deleting
 * integrations, or applying categorizations. Returns null when the request is
 * allowed through.
 */
function enforceSameOrigin(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Reject requests with no origin AND no referer (suspicious for a mutating
  // call from a browser context).
  if (!origin && !referer) {
    return new NextResponse("Forbidden: missing origin/referer", { status: 403 });
  }

  const allowed = (value: string | null): boolean => {
    if (!value) return false;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };

  if (origin && !allowed(origin)) {
    return new NextResponse("Forbidden: cross-origin request blocked", { status: 403 });
  }
  if (!origin && referer && !allowed(referer)) {
    return new NextResponse("Forbidden: cross-origin referer", { status: 403 });
  }

  return null;
}

export function proxy(request: NextRequest) {
  // API routes carry no locale prefix; just enforce same-origin on mutations.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return enforceSameOrigin(request) ?? NextResponse.next();
  }
  // Everything else is a page route: apply locale routing.
  return handleI18nRouting(request);
}

export const config = {
  // First entry keeps full CSRF coverage over the API; second handles page
  // locale routing (skipping the API, Next internals, and static files).
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
