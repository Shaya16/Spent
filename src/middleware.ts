import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin enforcement for mutating API requests.
 *
 * Spent runs on 127.0.0.1 only, but any webpage you visit can fire a POST
 * to http://127.0.0.1:3000/api/sync from inside your browser. This
 * middleware rejects state-changing requests whose Origin or Referer
 * isn't the app itself, so a malicious tab can't trick your localhost
 * into syncing, deleting integrations, or applying categorizations.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // SSE streams use POST too (sync), but they're still subject to the
  // same-origin requirement, so no exception needed.

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Accept requests where Origin or Referer points to our own host.
  // Reject requests with no origin AND no referer (suspicious for a
  // mutating call from a browser context).
  if (!origin && !referer) {
    return new NextResponse("Forbidden: missing origin/referer", {
      status: 403,
    });
  }

  const allowed = (value: string | null): boolean => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.host === host;
    } catch {
      return false;
    }
  };

  if (origin && !allowed(origin)) {
    return new NextResponse("Forbidden: cross-origin request blocked", {
      status: 403,
    });
  }
  if (!origin && referer && !allowed(referer)) {
    return new NextResponse("Forbidden: cross-origin referer", {
      status: 403,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
