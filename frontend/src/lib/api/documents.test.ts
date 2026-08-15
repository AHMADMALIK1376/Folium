import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import type { TipTapDoc } from "./types";

const apiFetch = vi.fn();
vi.mock("./client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession } }),
}));

const {
  updateDocument,
  listShares,
  createShare,
  updateShare,
  deleteShare,
  importDocument,
  listVersions,
  getVersion,
  restoreVersion,
  exportMarkdown,
} = await import("./documents");

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

describe("share fetchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the shares on a document", async () => {
    apiFetch.mockResolvedValue([]);

    await listShares("doc-1");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/documents/doc-1/shares");
  });

  it("creates a share with an email and a permission", async () => {
    apiFetch.mockResolvedValue({ user_id: "u2" });

    await createShare("doc-1", "friend@example.com", "view");

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/doc-1/shares");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      email: "friend@example.com",
      permission: "view",
    });
  });

  it("changes an existing permission with a PATCH", async () => {
    apiFetch.mockResolvedValue(null);

    await updateShare("doc-1", "u2", "edit");

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/doc-1/shares/u2");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ permission: "edit" });
  });

  it("removes a share", async () => {
    // 204, no body. apiFetch resolves null for that, which must not be treated
    // as a failure.
    apiFetch.mockResolvedValue(null);

    await expect(deleteShare("doc-1", "u2")).resolves.toBeNull();

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/doc-1/shares/u2");
    expect(init.method).toBe("DELETE");
  });
});

describe("version history fetchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists a document's versions", async () => {
    apiFetch.mockResolvedValue([]);

    await listVersions("doc-1");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/documents/doc-1/versions");
  });

  it("reads one version, which is the only way to get its content", async () => {
    apiFetch.mockResolvedValue({ id: "v1", content });

    await getVersion("doc-1", "v1");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/documents/doc-1/versions/v1");
  });

  it("restores a version and returns the updated document", async () => {
    apiFetch.mockResolvedValue({ id: "doc-1", content });

    const restored = await restoreVersion("doc-1", "v1");

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/doc-1/versions/v1/restore");
    expect(init.method).toBe("POST");
    // The updated document comes back, so the editor can take the new content
    // without a second request.
    expect(restored).toMatchObject({ content });
  });
});

describe("importDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts the file as multipart under the field name the backend expects", async () => {
    apiFetch.mockResolvedValue({ id: "doc-9" });
    const file = new File(["# Hi"], "notes.md", { type: "text/markdown" });

    await importDocument(file);

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/documents/import");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // "file" is not arbitrary — it is the name of the backend's File()
    // parameter, and any other name is a 422.
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("sets no content type of its own, leaving that to apiFetch", async () => {
    apiFetch.mockResolvedValue({ id: "doc-9" });

    await importDocument(new File(["x"], "a.txt", { type: "text/plain" }));

    const [, init] = apiFetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });
});

describe("exportMarkdown", () => {
  const markdown = "# Quarterly plan\n\n- An item";

  function response(init: ResponseInit = {}) {
    return new Response(markdown, {
      status: 200,
      headers: { "Content-Type": "text/markdown" },
      ...init,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-abc" } },
    });
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  });

  it("requests the export endpoint with the bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        headers: { "Content-Disposition": 'attachment; filename="a.md"' },
      }),
    );

    await exportMarkdown("doc-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/documents/doc-1/export?format=markdown");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc",
    );
  });

  it("returns the body as a blob without parsing it as JSON", async () => {
    // The point of not going through apiFetch, which calls response.json() on
    // every success. Markdown is not JSON, so routing this through it would
    // throw on a response that is perfectly correct.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response());

    const { blob } = await exportMarkdown("doc-1");

    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe(markdown);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("takes the filename from the header the server sent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        headers: {
          "Content-Disposition": 'attachment; filename="Quarterly-plan.md"',
        },
      }),
    );

    const { filename } = await exportMarkdown("doc-1");

    // The server derived and sanitised it; inventing one here would risk a
    // different — and possibly invalid — answer.
    expect(filename).toBe("Quarterly-plan.md");
  });

  it("falls back to a usable name when the header is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response());

    const { filename } = await exportMarkdown("doc-1");

    expect(filename).toBe("document.md");
  });

  it("prefers the UTF-8 name so a non-Latin title is not lost", async () => {
    // Nothing of these titles survives the ASCII fallback, so reading that one
    // first would save every such document as "document.md".
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        headers: {
          "Content-Disposition":
            "attachment; filename=\"document.md\"; filename*=UTF-8''%E5%AD%A3%E5%BA%A6%E8%AE%A1%E5%88%92.md",
        },
      }),
    );

    const { filename } = await exportMarkdown("doc-1");

    expect(filename).toBe("季度计划.md");
  });

  it("uses the ASCII name when the encoded one is malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        headers: {
          "Content-Disposition":
            "attachment; filename=\"Quarterly-plan.md\"; filename*=UTF-8''%E5%AD",
        },
      }),
    );

    const { filename } = await exportMarkdown("doc-1");

    expect(filename).toBe("Quarterly-plan.md");
  });

  it("raises an ApiError carrying the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(exportMarkdown("doc-1")).rejects.toBeInstanceOf(ApiError);
    await expect(exportMarkdown("doc-1")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to call the API without a session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(exportMarkdown("doc-1")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
