import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createDocument } from "@/lib/repo";
import { markdownToHtml, plainTextToHtml, titleFromFilename } from "@/lib/importFile";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTENSIONS = [".txt", ".md", ".markdown"];

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const name = file.name || "upload.txt";
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      {
        error: `Unsupported file type "${ext}". Only .txt and .md files can be imported.`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File is too large. Max size is 2MB." },
      { status: 400 }
    );
  }

  const text = await file.text();
  const html = ext === ".txt" ? plainTextToHtml(text) : markdownToHtml(text);
  const title = titleFromFilename(name);

  const doc = createDocument(me.id, title, html);
  return NextResponse.json({ document: doc }, { status: 201 });
}
