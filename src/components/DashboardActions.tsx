"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DashboardActions() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDocument() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create document");
      router.push(`/documents/${data.document.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create document");
      setCreating(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      router.push(`/documents/${data.document.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="toolbar-actions">
        <button className="btn btn-primary" onClick={createDocument} disabled={creating}>
          {creating ? "Creating…" : "+ New document"}
        </button>
        <div className="upload-row">
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Importing…" : "Upload .txt / .md"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
