"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SimpleUser = { id: string; name: string; email: string };

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LoginOptions({ users }: { users: SimpleUser[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(userId: string) {
    setError(null);
    setLoadingId(userId);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoadingId(null);
    }
  }

  return (
    <div>
      {users.map((u) => (
        <button
          key={u.id}
          className="user-option"
          onClick={() => login(u.id)}
          disabled={loadingId !== null}
        >
          <span className="avatar">{initials(u.name)}</span>
          <span className="user-option-meta">
            <span className="user-option-name">{u.name}</span>
            <span className="user-option-email">{u.email}</span>
          </span>
        </button>
      ))}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
