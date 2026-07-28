import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

const { GET } = await import("./route");

describe("GET /callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it.each([
    "http://localhost:3000/callback?code=abc&next=@evil.example.com",
    "http://localhost:3000/callback?code=abc&next=.evil.example.com",
    "http://localhost:3000/callback?code=abc&next=//evil.example.com",
    "http://localhost:3000/callback?code=abc&next=https://evil.example.com",
  ])("never redirects off-origin for %s", async (url) => {
    const response = await GET(new NextRequest(url));
    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    expect(new URL(location!).host).toBe("localhost:3000");
  });

  it("redirects to the requested same-origin path", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/callback?code=abc&next=/documents/xyz"),
    );
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/documents/xyz");
  });
});
