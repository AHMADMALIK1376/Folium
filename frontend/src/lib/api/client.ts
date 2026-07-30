import { createClient } from "@/lib/supabase/client";
import { ApiError } from "./errors";
import type { UserProfile } from "./types";

export type { UserProfile } from "./types";

/** Call the FastAPI backend with the current access token.
 *
 * The token is read on every call rather than cached: Supabase rotates it
 * roughly hourly, and a stale cached token produces 401s indistinguishable
 * from a backend fault. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(0, "Not signed in");
  }

  // A multipart upload must not carry a hardcoded content type: the browser
  // generates multipart/form-data along with the boundary parameter that
  // delimits the parts, and overriding it makes the server reject the body it
  // was actually sent. Every other body stays JSON, as before.
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      // Read via clone(): leaves the original body stream untouched, so a
      // Response object reused across calls (as test mocks do) stays readable.
      const body = await response.clone().json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body. Keep the status text.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return null as T;
  return (await response.clone().json()) as T;
}

export function getMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/me");
}
