"use client";

import { createYjsProvider, type YSweetProvider } from "@y-sweet/client";
import { useEffect, useState } from "react";
import * as Y from "yjs";

import { getCollabSession } from "@/lib/api/documents";

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
}

const DISABLED: Collaboration = {
  enabled: false,
  provider: null,
  doc: null,
  loading: false,
  canWrite: false,
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

    const join = async () => {
      try {
        const session = await getCollabSession(documentId);

        // Nothing configured, or the room was refused. Not an error worth
        // showing: the editor still works.
        if (!session.enabled || !session.url || !session.doc_id) {
          if (!cancelled) setState(DISABLED);
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
        });
      } catch {
        // 503, a network failure, anything: edit alone.
        if (!cancelled) setState(DISABLED);
      }
    };

    void join();

    return () => {
      cancelled = true;
      // Ordering matters: the provider holds a socket bound to this doc, so it
      // goes first. Leaving either behind leaks a connection per navigation.
      provider?.destroy();
      doc?.destroy();
    };
  }, [documentId]);

  return state;
}
