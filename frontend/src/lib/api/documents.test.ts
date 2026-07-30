import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import type { TipTapDoc } from "./types";

const apiFetch = vi.fn();
vi.mock("./client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { updateDocument } = await import("./documents");

const content: TipTapDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

describe("updateDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCHes the document", async () => {
    apiFetch.mockResolvedValue({ id: "doc-1" });

    await updateDocument("doc-1", { content });

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/doc-1");
    expect(init.method).toBe("PATCH");
  });

  it("sends only the fields given", async () => {
    // The backend treats an omitted field as "unchanged", so sending a title of
    // undefined alongside a content change must not blank the title.
    apiFetch.mockResolvedValue({ id: "doc-1" });

    await updateDocument("doc-1", { title: "Renamed" });

    const [, init] = apiFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ title: "Renamed" });
  });

  it("passes init through so the unload flush can set keepalive", async () => {
    // sendBeacon cannot carry an Authorization header; keepalive can, and is the
    // only way a pending save survives the page being torn down.
    apiFetch.mockResolvedValue({ id: "doc-1" });

    await updateDocument("doc-1", { content }, { keepalive: true });

    const [, init] = apiFetch.mock.calls[0];
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe("PATCH");
  });

  it("propagates an ApiError rather than swallowing it", async () => {
    apiFetch.mockRejectedValue(new ApiError(404, "Document not found"));

    await expect(updateDocument("doc-1", { content })).rejects.toMatchObject({
      status: 404,
    });
  });
});
