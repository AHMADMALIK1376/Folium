"use client";

import { createYjsProvider, type YSweetProvider } from "@y-sweet/client";
import { useEffect, useState } from "react";
import * as Y from "yjs";

import { getCollabSession } from "@/lib/api/documents";
import type { CollabUser } from "@/lib/api/types";

/** What the user is told about the connection.
 *
 * Three states, not the provider's five: "handshaking" and "connecting" are the
 * same thing to a person waiting. */
export type ConnectionStatus = "connecting" | "connected" | "offline";

export interface Collaboration {
  /** False until a session is established, and permanently false when the
   *  deployment has no y-sweet configured or it could not be reached. */
  enabled: boolean;
  provider: YSweetProvider | null;
  doc: Y.Doc | null;
  /** True while the token request is in flight. The editor waits for this
   *  rather than mounting non-collaboratively and switching, which would
   *  otherwise discard whatever had been typed in between. */
  loading: boolean;
  canWrite: boolean;
  /** Who this browser is, for the cursor label. Null until the session is
   *  established, and when collaboration is off — nothing renders a cursor
   *  then anyway. */
  user: CollabUser | null;
  /** Live connection state. Silence was the 4-i behaviour: a disconnected
   *  editor looked exactly like a live one, while nothing typed into it was
   *  reaching anybody. */
  status: ConnectionStatus;
}

const DISABLED: Collaboration = {
  enabled: false,
  provider: null,
  doc: null,
  loading: false,
  canWrite: false,
  user: null,
  status: "offline",
};

/** Join a document's collaboration room, if there is one.
 *
 * Degrades rather than fails. An unconfigured deployment, a 503 from a
 * collaboration server that is down, or any other error all resolve to
 * `enabled: false`, and the editor carries on as the single-user editor it was
 * before Phase 4. Losing live collaboration must never mean losing the ability
 * to write.
 */
export function useCollaboration(documentId: string): Collaboration {
  const [state, setState] = useState<Collaboration>({ ...DISABLED, loading: true });

  useEffect(() => {
    let cancelled = false;
    let provider: YSweetProvider | null = null;
    let doc: Y.Doc | null = null;
    let statusListener: ((event: unknown) => void) | null = null;

    const join = async () => {
      try {
        const session = await getCollabSession(documentId);

        // Nothing configured, or the room was refused. Not an error worth
        // showing: the editor still works.
        if (!session.enabled || !session.url || !session.doc_id) {
          if (!cancelled) setState({ ...DISABLED, user: session.user ?? null });
          return;
        }

        if (cancelled) return;

        doc = new Y.Doc();
        provider = createYjsProvider(doc, session.doc_id, async () => ({
          url: session.url as string,
          baseUrl: session.base_url ?? (session.url as string),
          docId: session.doc_id as string,
          token: session.token ?? undefined,
        }));

        setState({
          enabled: true,
          provider,
          doc,
          loading: false,
          canWrite: session.permission === "owner" || session.permission === "edit",
          user: session.user,
          status: "connecting",
        });

        // The provider reconnects on its own, so there is nothing to press —
        // the honest thing is to report what is happening while it does.
        const onStatus = (event: unknown) => {
          const raw =
            typeof event === "string"
              ? event
              : ((event as { status?: string } | null)?.status ?? "");
          const next: ConnectionStatus =
            raw === "connected"
              ? "connected"
              : raw === "connecting" || raw === "handshaking"
                ? "connecting"
                : "offline";
          if (!cancelled) setState((current) => ({ ...current, status: next }));
        };

        provider.on("connection-status", onStatus);
        statusListener = onStatus;
      } catch {
        // 503, a network failure, anything: edit alone.
        if (!cancelled) setState(DISABLED);
      }
    };

    void join();

    return () => {
      cancelled = true;
      if (statusListener && provider) {
        provider.off("connection-status", statusListener);
      }
      // Ordering matters: the provider holds a socket bound to this doc, so it
      // goes first. Leaving either behind leaks a connection per navigation.
      provider?.destroy();
      doc?.destroy();
    };
  }, [documentId]);

  return state;
}
