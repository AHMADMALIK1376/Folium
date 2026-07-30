import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/account", "/dashboard", "/documents", "/trash"];

// The v1 app is retired but still compiled until Phase 2C-iii deletes it. Its
// login route mints a session for a seeded account with no password, so
// leaving these reachable would hand anyone full access to the old data
// layer. 404 rather than 403: their existence is not worth advertising.
//
// `/documents` used to be here too, for the v1 editor. Phase 2C-ii replaced
// that page, so the path is now protected rather than denied — but `/api/`
// must stay, because those routes are still the v1 ones.
const RETIRED = ["/api/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (RETIRED.some((p) => pathname.startsWith(p))) {
    return new NextResponse(null, { status: 404 });
  }

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
