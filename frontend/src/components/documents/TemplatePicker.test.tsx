import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentListItem } from "@/lib/api/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const duplicateDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  duplicateDocument: (...a: unknown[]) => duplicateDocument(...a),
}));

const { TemplatePicker } = await import("./TemplatePicker");
const { BUILT_IN_TEMPLATES } = await import("@/lib/editor/templates");

function template(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: "t1",
    title: "House style brief",
    owner_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    starred: false,
    folder_id: null,
    is_template: true,
    ...overrides,
  };
}

async function open(templates: DocumentListItem[] = []) {
  render(<TemplatePicker templates={templates} />);
  await userEvent.click(screen.getByRole("button", { name: /new from template/i }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue({ id: "new-doc" });
  duplicateDocument.mockResolvedValue({ id: "new-doc" });
});

describe("TemplatePicker", () => {
  it("always offers the built-in templates", async () => {
    // Even with none of your own — which is the state every new account is in,
    // and the one where a picker is most useful.
    await open([]);

    for (const built of BUILT_IN_TEMPLATES) {
      expect(await screen.findByText(built.title)).toBeInTheDocument();
    }
  });

  it("lists your own templates alongside them", async () => {
    await open([template({ title: "House style brief" })]);

    expect(await screen.findByText("House style brief")).toBeInTheDocument();
    expect(screen.getByText(/^yours$/i)).toBeInTheDocument();
  });

  it("says nothing about yours when you have none", async () => {
    await open([]);

    expect(screen.queryByText(/^yours$/i)).not.toBeInTheDocument();
  });

  it("creates from a built-in template and goes straight to it", async () => {
    // Someone who picked a template wants to start writing, not to look at a
    // list the document is now sitting in.
    await open([]);

    await userEvent.click(screen.getByText(BUILT_IN_TEMPLATES[0].title));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/documents",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/documents/new-doc"));
  });

  it("creates from your own template under its own name, not Copy of", async () => {
    // as_copy=false is the whole difference between using a template and
    // duplicating a document.
    await open([template()]);

    await userEvent.click(screen.getByRole("button", { name: "House style brief" }));

    expect(duplicateDocument).toHaveBeenCalledWith("t1", false);
  });

  it("says so when it cannot create the document", async () => {
    apiFetch.mockRejectedValue(new Error("offline"));

    await open([]);
    await userEvent.click(screen.getByText(BUILT_IN_TEMPLATES[0].title));

    expect(await screen.findByText(/could not create the document/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the built-in templates themselves", () => {
  it("are valid TipTap documents", () => {
    // They are written by hand, and a malformed one would be rejected by the
    // backend's schema validator at the worst possible moment — when someone
    // clicks it.
    for (const built of BUILT_IN_TEMPLATES) {
      expect(built.content.type).toBe("doc");
      expect(Array.isArray(built.content.content)).toBe(true);
      expect(built.content.content!.length).toBeGreaterThan(0);
    }
  });

  it("have keys that are distinct and stable-looking", () => {
    const keys = BUILT_IN_TEMPLATES.map((t) => t.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("each say what they are for", () => {
    for (const built of BUILT_IN_TEMPLATES) {
      expect(built.title.trim()).not.toBe("");
      expect(built.description.trim()).not.toBe("");
    }
  });
});
