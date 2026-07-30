import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/account", "/dashboard", "/documents", "/trash"];

// There is no deny-list any more. Phases 2B and 2C carried one so the retired
// v1 routes returned 404 — its login route minted a session for a seeded
// account with no password — but Phase 2C-iii deleted those routes outright,
// and a list guarding paths that no longer exist is worse than none: it reads
// as though something still needs guarding.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { response, user } = await updateSession(request);

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Send them back where they were headed once they sign in.
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Must return the response from updateSession: it carries the refreshed
  // auth cookies. Returning a fresh NextResponse drops them and signs the
  // user out as soon as their token rotates.
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images).*)"],
};
