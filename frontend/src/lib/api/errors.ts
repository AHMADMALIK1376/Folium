/** An error from the Folium API, carrying the HTTP status.
 *
 * Callers need the status to tell 401 (re-authenticate) from 503 (Supabase key
 * endpoint unreachable) from a genuine 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}
