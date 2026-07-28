import { AuthMessage } from "@/components/auth/AuthMessage";
import { ApiError } from "@/lib/api/errors";

/** Render a failed API call in terms the user can act on.
 *
 * 401 and 503 stay distinct deliberately: the backend separates "your session
 * expired" from "the signing keys are unreachable", and collapsing them would
 * make an outage look like every user's credentials failing at once.
 *
 * `fallback` covers everything else, and differs per caller — "could not load"
 * is wrong wording for a failed create. The two cases above do not vary,
 * because an expired session reads the same whatever the user was attempting.
 */
export function ApiErrorMessage({
  error,
  fallback,
}: {
  error: unknown;
  fallback?: React.ReactNode;
}) {
  if (error instanceof ApiError && error.status === 503) {
    return (
      <AuthMessage kind="error">
        Folium is temporarily unavailable. Try again in a moment.
      </AuthMessage>
    );
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <AuthMessage kind="error">
        Your session has expired.{" "}
        <a href="/login" className="underline">
          Sign in again
        </a>
        .
      </AuthMessage>
    );
  }

  return (
    <AuthMessage kind="error">
      {fallback ?? (
        <>
          Could not load your documents.{" "}
          <a href="/dashboard" className="underline">
            Try again
          </a>
          .
        </>
      )}
    </AuthMessage>
  );
}
