"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { ShareModal } from "@/components/ShareModal";
import type { DocumentWithMeta, User } from "@/lib/types";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export function DocumentEditorShell({
  doc,
  currentUser,
}: {
  doc: DocumentWithMeta;
  currentUser: User;
}) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [sharedWith, setSharedWith] = useState(doc.shared_with ?? []);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [shareOpen, setShareOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, content });
  latest.current = { title, content };

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latest.current),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [doc.id]);

  const scheduleSave = useCallback(() => {
    setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Save immediately before leaving the tab if there's an unsaved change.
  useEffect(() => {
    function handler() {
      if (status === "unsaved" || status === "saving") {
        navigator.sendBeacon(
          `/api/documents/${doc.id}`,
          new Blob([JSON.stringify(latest.current)], { type: "application/json" })
        );
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [doc.id, status]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    scheduleSave();
  }

  function handleContentChange(html: string) {
    setContent(html);
    scheduleSave();
  }

  const statusLabel: Record<SaveStatus, string> = {
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Couldn't save — retrying on next edit",
  };

  return (
    <div className="page">
      <div className="editor-topbar">
        <Link href="/dashboard" className="btn btn-ghost" aria-label="Back to dashboard">
          ← Dashboard
        </Link>
        <input
          className="title-input"
          value={title}
          onChange={handleTitleChange}
          aria-label="Document title"
        />
        <span className="save-status">{statusLabel[status]}</span>
        <div className="toolbar-actions">
          {doc.is_owner && (
            <button className="btn" onClick={() => setShareOpen(true)}>
              Share{sharedWith.length > 0 ? ` (${sharedWith.length})` : ""}
            </button>
          )}
        </div>
      </div>

      <Editor content={content} editable={true} onChange={handleContentChange} />

      {shareOpen && (
        <ShareModal
          documentId={doc.id}
          sharedWith={sharedWith}
          onClose={() => setShareOpen(false)}
          onSharedChange={setSharedWith}
        />
      )}
    </div>
  );
}
