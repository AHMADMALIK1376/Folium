import { AuthMessage } from "@/components/auth/AuthMessage";
import { ApiError } from "@/lib/api/errors";

/** Render a failed API call in terms the user can act on.
 *
 * 401 and 503 stay distinct deliberately: the backend separates "your session
 * expired" from "the signing keys are unreachable", and collapsing them would
 * make an outage look like every user's credentials failing at once. They are
 * also checked first, whatever else the caller asks for — retrying a 401 fails
 * forever, so that message has to win.
 *
 * `fallback` covers everything else, and differs per caller — "could not load"
 * is wrong wording for a failed create.
 *
 * `detailStatuses` opts in to showing the backend's own `detail` for particular
 * statuses. Sharing uses it for 422, where the server says "No user with that
 * email" — more useful than anything written here. It is opt-in per status
 * rather than automatic because a detail elsewhere may be an internal message
 * never written for a person to read.
 *
 * `notFoundMessage` handles a 404 where the caller knows what went missing.
 */
export function ApiErrorMessage({
  error,
  fallback,
  detailStatuses,
  notFoundMessage,
}: {
  error: unknown;
  fallback?: React.ReactNode;
  detailStatuses?: number[];
  notFoundMessage?: React.ReactNode;
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

  if (error instanceof ApiError && error.status === 404 && notFoundMessage) {
    return <AuthMessage kind="error">{notFoundMessage}</AuthMessage>;
  }

  if (
    error instanceof ApiError &&
    detailStatuses?.includes(error.status) &&
    error.detail
  ) {
    return <AuthMessage kind="error">{error.detail}</AuthMessage>;
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
