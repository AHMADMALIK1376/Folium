import { NextResponse, type NextRequest } from "next/server";

import { safeRedirect } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/** Where Supabase sends the browser after an email link.
 *
 * The link carries a one-time code that must be exchanged for a session
 * cookie. Without this route, magic links and confirmation emails land on a
 * page with no session and appear to have silently failed. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // An unchecked `next` allows userinfo-confusion redirects: the WHATWG URL
  // parser used by browsers and Next.js reads "@evil.example.com" as
  // userinfo and treats "evil.example.com" as the host, so
  // `${origin}${next}` would silently send an authenticated user off-origin.
  // safeRedirect() only accepts a same-origin absolute path.
  const next = safeRedirect(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}
