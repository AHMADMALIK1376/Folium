"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";

export function TopBar({ user }: { user: User }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="topbar">
      <div className="topbar-title">
        <img src="/logo.svg" alt="" />
        Folium
      </div>
      <div className="topbar-user">
        <span>
          {user.name} <span style={{ color: "#b0b0b6" }}>&middot;</span> {user.email}
        </span>
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
