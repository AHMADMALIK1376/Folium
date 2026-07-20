import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default function Home() {
  const user = getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
