import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const getCollabSession = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  getCollabSession: (...a: unknown[]) => getCollabSession(...a),
}));

const destroy = vi.fn();
const createYjsProvider = vi.fn((..._args: unknown[]) => ({ destroy }));
vi.mock("@y-sweet/client", () => ({
  createYjsProvider: (...a: unknown[]) => createYjsProvider(...a),
}));

const { useCollaboration } = await import("./useCollaboration");

function session(overrides = {}) {
  return {
    enabled: true,
    url: "ws://localhost:8080/d",
    base_url: "http://localhost:8080/d",
    doc_id: "folium-doc-1",
    token: "a-room-token",
    permission: "owner",
    ...overrides,
  };
}

describe("useCollaboration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("connects when the backend reports a room", async () => {
    getCollabSession.mockResolvedValue(session());

    const { result } = renderHook(() => useCollaboration("doc-1"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(createYjsProvider).toHaveBeenCalledTimes(1);
    expect(result.current.canWrite).toBe(true);
    expect(result.current.doc).not.toBeNull();
  });

  it("stays off when the deployment has no collaboration server", async () => {
    // Not an error state. The editor keeps working exactly as it did before
    // Phase 4, so this must not construct a provider or surface a failure.
    getCollabSession.mockResolvedValue(session({ enabled: false, url: null, doc_id: null }));

    const { result } = renderHook(() => useCollaboration("doc-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(createYjsProvider).not.toHaveBeenCalled();
  });

  it("edits alone when the collaboration server is down", async () => {
    // 503. Losing live collaboration must never mean losing the ability to
    // write, so this degrades silently rather than throwing.
    getCollabSession.mockRejectedValue(new ApiError(503, "unavailable"));

    const { result } = renderHook(() => useCollaboration("doc-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(createYjsProvider).not.toHaveBeenCalled();
  });

  it("reports a viewer as unable to write", async () => {
    getCollabSession.mockResolvedValue(session({ permission: "view" }));

    const { result } = renderHook(() => useCollaboration("doc-1"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.canWrite).toBe(false);
  });

  it("passes the room id and token through to the provider", async () => {
    getCollabSession.mockResolvedValue(session());

    renderHook(() => useCollaboration("doc-1"));

    await waitFor(() => expect(createYjsProvider).toHaveBeenCalled());
    const args = createYjsProvider.mock.calls[0] as unknown[];
    expect(args[1]).toBe("folium-doc-1");
    // The auth callback hands back exactly what the backend minted, rather than
    // letting the client negotiate its own access.
    const authEndpoint = args[2] as () => Promise<unknown>;
    await expect(authEndpoint()).resolves.toMatchObject({
      token: "a-room-token",
      docId: "folium-doc-1",
    });
  });

  it("tears the connection down on unmount", async () => {
    getCollabSession.mockResolvedValue(session());

    const { result, unmount } = renderHook(() => useCollaboration("doc-1"));
    await waitFor(() => expect(result.current.enabled).toBe(true));

    unmount();

    // Otherwise every navigation between documents leaks a websocket.
    expect(destroy).toHaveBeenCalled();
  });
});
