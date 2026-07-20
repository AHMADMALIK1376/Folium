import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteDocument, getDocumentWithMeta, updateDocument } from "@/lib/repo";
import { updateDocumentSchema } from "@/lib/validation";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const doc = getDocumentWithMeta(params.id, me.id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = getDocumentWithMeta(params.id, me.id);
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const updated = updateDocument(params.id, parsed.data);
  return NextResponse.json({ document: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = getDocumentWithMeta(params.id, me.id);
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!existing.is_owner) {
    return NextResponse.json(
      { error: "Only the owner can delete this document" },
      { status: 403 }
    );
  }

  deleteDocument(params.id);
  return NextResponse.json({ ok: true });
}
