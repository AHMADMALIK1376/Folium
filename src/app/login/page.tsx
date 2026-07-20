import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAllUsers } from "@/lib/repo";
import { LoginOptions } from "@/components/LoginOptions";

export default function LoginPage() {
  const existing = getCurrentUser();
  if (existing) redirect("/dashboard");

  const users = getAllUsers().map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.svg" alt="Folium" width={34} height={34} />
          <span>Folium</span>
        </div>
        <p>
          This demo uses seeded accounts instead of real sign-up/sign-in, so you
          can test sharing between users. Pick one to continue.
        </p>
        <LoginOptions users={users} />
      </div>
    </div>
  );
}
