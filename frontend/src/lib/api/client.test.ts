import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession } }),
}));

const { apiFetch } = await import("./client");

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-abc" } },
    });
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  });

  it("attaches the bearer token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await apiFetch("/api/v1/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/me");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc",
    );
  });

  it("reads the token fresh on every call, never caching it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await apiFetch("/a");
    await apiFetch("/b");

    // Tokens expire hourly. A cached one would start returning 401s that look
    // exactly like a backend fault.
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("throws ApiError carrying the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
      }),
    );

    await expect(apiFetch("/api/v1/me")).rejects.toMatchObject({
      status: 401,
      detail: "Not authenticated",
    });
    await expect(apiFetch("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("distinguishes 503 from an auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unavailable" }), { status: 503 }),
    );

    // The backend deliberately separates "keys unavailable" (503) from
    // "not authenticated" (401). Collapsing them would hide an outage.
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 503 });
  });

  it("errors with status 0 when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 0 });
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ email: "a@b.c" }), { status: 200 }),
    );
    await expect(apiFetch<{ email: string }>("/x")).resolves.toEqual({
      email: "a@b.c",
    });
  });

  it("handles a 204 with no body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(apiFetch("/x")).resolves.toBeNull();
  });
});
