/** The path to send a user to after signing in.
 *
 * Only same-origin absolute paths are allowed. Anything else falls back to the
 * default, because a redirect target taken from the query string would
 * otherwise let `?redirectTo=https://evil.example.com` bounce a
 * freshly-authenticated user to an attacker's site.
 */
export const DEFAULT_REDIRECT = "/dashboard";

export function safeRedirect(target: string | null | undefined): string {
  if (!target) return DEFAULT_REDIRECT;

  // Must be an absolute path on this origin.
  if (!target.startsWith("/")) return DEFAULT_REDIRECT;

  // "//evil.com" is protocol-relative and navigates off-origin. Browsers also
  // normalise backslashes, so "/\evil.com" and "/\\evil.com" are equally unsafe.
  if (target.startsWith("//") || target.startsWith("/\\")) return DEFAULT_REDIRECT;

  return target;
}
