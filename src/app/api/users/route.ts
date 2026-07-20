import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAllUsers } from "@/lib/repo";

export async function GET() {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const users = getAllUsers().map((u) => ({ id: u.id, name: u.name, email: u.email }));
  return NextResponse.json({ users });
}
