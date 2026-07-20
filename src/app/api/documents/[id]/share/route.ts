import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDocumentWithMeta,
  getUserByEmail,
  shareDocument,
  unshareDocument,
} from "@/lib/repo";
import { shareDocumentSchema } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const doc = getDocumentWithMeta(params.id, me.id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!doc.is_owner) {
    return NextResponse.json(
      { error: "Only the owner can share this document" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = shareDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const target = getUserByEmail(parsed.data.email);
  if (!target) {
    return NextResponse.json(
      { error: "No user with that email. Try alice@example.com, bob@example.com, or carol@example.com." },
      { status: 404 }
    );
  }
  if (target.id === me.id) {
    return NextResponse.json({ error: "You already own this document" }, { status: 400 });
  }

  shareDocument(params.id, target.id);
  const updated = getDocumentWithMeta(params.id, me.id);
  return NextResponse.json({ document: updated }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const doc = getDocumentWithMeta(params.id, me.id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!doc.is_owner) {
    return NextResponse.json(
      { error: "Only the owner can modify sharing" },
      { status: 403 }
    );
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  unshareDocument(params.id, userId);
  const updated = getDocumentWithMeta(params.id, me.id);
  return NextResponse.json({ document: updated });
}
