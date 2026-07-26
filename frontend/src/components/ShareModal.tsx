"use client";

import { useState } from "react";

type SharedUser = { id: string; name: string; email: string };

export function ShareModal({
  documentId,
  sharedWith,
  onClose,
  onSharedChange,
}: {
  documentId: string;
  sharedWith: SharedUser[];
  onClose: () => void;
  onSharedChange: (users: SharedUser[]) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not share document");
      onSharedChange(data.document.shared_with);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not share document");
    } finally {
      setLoading(false);
    }
  }

  async function remove(userId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/share?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove access");
      onSharedChange(data.document.shared_with);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove access");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share document</h3>
        <p className="hint">
          Enter a teammate&apos;s email to give them access. Seeded accounts:
          alice@example.com, bob@example.com, carol@example.com.
        </p>
        <form onSubmit={share} style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Sharing…" : "Share"}
          </button>
        </form>
        {error && <div className="error-text">{error}</div>}

        {sharedWith.length > 0 && (
          <div className="share-list">
            {sharedWith.map((u) => (
              <div className="share-row" key={u.id}>
                <span>
                  {u.name} <span style={{ color: "#9a9aa2" }}>({u.email})</span>
                </span>
                <button className="btn btn-ghost" onClick={() => remove(u.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
