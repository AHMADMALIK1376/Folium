import { AuthMessage } from "@/components/auth/AuthMessage";
import { ApiError } from "@/lib/api/errors";

/** Render a failed API call in terms the user can act on.
 *
 * 401 and 503 stay distinct deliberately: the backend separates "your session
 * expired" from "the signing keys are unreachable", and collapsing them would
 * make an outage look like every user's credentials failing at once.
 */
export function ApiErrorMessage({ error }: { error: unknown }) {
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
      Could not load your documents.{" "}
      <a href="/dashboard" className="underline">
        Try again
      </a>
      .
    </AuthMessage>
  );
}
