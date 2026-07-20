import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createDocument, listDocumentsForUser } from "@/lib/repo";
import { createDocumentSchema } from "@/lib/validation";

export async function GET() {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { owned, shared } = listDocumentsForUser(me.id);
  return NextResponse.json({ owned, shared });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const doc = createDocument(me.id, parsed.data.title?.trim() || "Untitled document");
  return NextResponse.json({ document: doc }, { status: 201 });
}
