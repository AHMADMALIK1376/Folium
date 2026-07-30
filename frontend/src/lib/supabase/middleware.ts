import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh the auth cookie and report who is signed in.
 *
 * Returns the response carrying refreshed cookies. Callers must return that
 * exact object, or the refreshed session is dropped and the user is silently
 * signed out when their token expires. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only reads the
  // cookie, which a client could have forged, so it must not gate access.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
