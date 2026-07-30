import Link from "next/link";

import { AuthMessage } from "@/components/auth/AuthMessage";

/** Shown for a 404 from the documents API.
 *
 * One message covers both "no such document" and "you may not see this one",
 * because the backend deliberately answers 404 for both. Splitting them here
 * would re-open the enumeration hole the backend closed: a distinct "you don't
 * have access" reply confirms the document exists.
 */
export function DocumentNotFound() {
  return (
    <AuthMessage kind="error">
      This document does not exist, or you do not have access to it.{" "}
      <Link href="/dashboard" className="underline">
        Back to your documents
      </Link>
      .
    </AuthMessage>
  );
}
