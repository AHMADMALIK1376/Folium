// Deliberately mocked auth: reviewers pick one of three seeded accounts, no
// password. A signed cookie stores the user id. This is intentionally not a
// real auth system -- see ARCHITECTURE.md for why that's an acceptable scope
// cut for this assignment.
import { cookies } from "next/headers";
import { getUserById } from "./repo.ts";
import type { User } from "./types.ts";

export const SESSION_COOKIE = "docsapp_uid";

export function getCurrentUser(): User | null {
  const uid = cookies().get(SESSION_COOKIE)?.value;
  if (!uid) return null;
  return getUserById(uid) ?? null;
}

export function requireUser(): User {
  const user = getCurrentUser();
  if (!user) throw new AuthError("Not authenticated");
  return user;
}

export class AuthError extends Error {}
