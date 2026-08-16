import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const searchDocuments = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  searchDocuments: (...a: unknown[]) => searchDocuments(...a),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const { DocumentSearch } = await import("./DocumentSearch");

function hit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc-1",
    title: "Quarterly plan",
    owner_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    snippet: "Revenue grew in the northern region",
    owned: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchDocuments.mockResolvedValue({ query: "northern", results: [hit()] });
});

describe("DocumentSearch", () => {
  it("finds documents and shows why each matched", async () => {
    render(<DocumentSearch />);

    await userEvent.type(screen.getByRole("searchbox"), "northern");

    expect(await screen.findByText("Quarterly plan")).toBeInTheDocument();
    // The snippet is the point: three documents called "Untitled document" is
    // not an answer to anything.
    expect(screen.getByText(/revenue grew/i)).toBeInTheDocument();
  });

  it("does not search for a single character", async () => {
    // One letter matches most of an account and costs a round trip to find out.
    render(<DocumentSearch />);

    await userEvent.type(screen.getByRole("searchbox"), "n");

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchDocuments).not.toHaveBeenCalled();
  });

  it("sends one request for a burst of typing, not one per keystroke", async () => {
    render(<DocumentSearch />);

    await userEvent.type(screen.getByRole("searchbox"), "northern");

    await waitFor(() => expect(searchDocuments).toHaveBeenCalled());
    expect(searchDocuments).toHaveBeenCalledTimes(1);
    expect(searchDocuments).toHaveBeenCalledWith("northern");
  });

  it("says so when nothing matches, quoting the query back", async () => {
    searchDocuments.mockResolvedValue({ query: "zzz", results: [] });

    render(<DocumentSearch />);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");

    expect(await screen.findByText(/nothing matches/i)).toHaveTextContent("zzz");
  });

  it("clears the results when the box is emptied", async () => {
    render(<DocumentSearch />);
    const box = screen.getByRole("searchbox");

    await userEvent.type(box, "northern");
    expect(await screen.findByText("Quarterly plan")).toBeInTheDocument();

    await userEvent.clear(box);

    await waitFor(() =>
      expect(screen.queryByText("Quarterly plan")).not.toBeInTheDocument(),
    );
  });

  it("marks a result that belongs to someone else", async () => {
    searchDocuments.mockResolvedValue({ query: "x", results: [hit({ owned: false })] });

    render(<DocumentSearch />);
    await userEvent.type(screen.getByRole("searchbox"), "northern");

    expect(await screen.findByText(/shared with you/i)).toBeInTheDocument();
  });

  it("reports a failure without clearing what is on screen", async () => {
    searchDocuments.mockRejectedValue(new ApiError(500, "boom"));

    render(<DocumentSearch />);
    await userEvent.type(screen.getByRole("searchbox"), "northern");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not search/i);
  });

  it("links each result to its document", async () => {
    render(<DocumentSearch />);
    await userEvent.type(screen.getByRole("searchbox"), "northern");

    expect(await screen.findByRole("link", { name: /quarterly plan/i })).toHaveAttribute(
      "href",
      "/documents/doc-1",
    );
  });
});
