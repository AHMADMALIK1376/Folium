import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getSession } }),
}));

const { serverApiFetch } = await import("./server");

describe("serverApiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "server-token" } },
    });
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  });

  it("forwards the token from the cookie-backed session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await serverApiFetch("/api/v1/documents");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/documents");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer server-token",
    );
  });

  it("reads the session on every call rather than caching it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await serverApiFetch("/a");
    await serverApiFetch("/b");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("never caches the response between calls", async () => {
    // Server Components render per request; a cached fetch would show one user
    // another user's documents.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await serverApiFetch("/x");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.cache).toBe("no-store");
  });

  it("raises ApiError carrying the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 }),
    );
    await expect(serverApiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 401 });
  });

  it("keeps 503 distinct from an auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unavailable" }), { status: 503 }),
    );
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 503 });
  });

  it("errors with status 0 when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 0 });
  });
});
