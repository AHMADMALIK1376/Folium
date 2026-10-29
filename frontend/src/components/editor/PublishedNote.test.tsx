import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublishStatus = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  getPublishStatus: (...a: unknown[]) => getPublishStatus(...a),
}));

const getFeatures = vi.fn();
vi.mock("@/lib/api/features", () => ({ getFeatures: () => getFeatures() }));

const { PublishedNote } = await import("./PublishedNote");
const { resetFeaturesCache } = await import("@/lib/hooks/useFeatures");

const published = {
  configured: true,
  can_publish: false,
  repo: "a/b",
  branch: "main",
  path: "docs/x.md",
  is_published: true,
  last_published_at: "2026-10-29T10:00:00Z",
  last_published_by: { id: "u1", display_name: "Alice" },
  file_url: "https://github.com/a/b/blob/main/docs/x.md",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetFeaturesCache();
  getFeatures.mockResolvedValue({ collaboration: true, attachments: true, github_publish: true });
  getPublishStatus.mockResolvedValue(published);
});

describe("PublishedNote", () => {
  it("says who published it last and links to the file", async () => {
    render(<PublishedNote documentId="d1" />);

    expect(await screen.findByText(/last published/i)).toHaveTextContent(/by Alice/);
    expect(screen.getByRole("link", { name: /view in github/i })).toHaveAttribute(
      "href",
      published.file_url,
    );
  });

  it("says nothing for a document that was never published", async () => {
    getPublishStatus.mockResolvedValue({ ...published, is_published: false });
    render(<PublishedNote documentId="d1" />);

    await waitFor(() => expect(getPublishStatus).toHaveBeenCalled());
    expect(screen.queryByText(/last published/i)).toBeNull();
  });

  it("does not even ask when the deployment has no GitHub", async () => {
    getFeatures.mockResolvedValue({ collaboration: true, attachments: true, github_publish: false });
    render(<PublishedNote documentId="d1" />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(getPublishStatus).not.toHaveBeenCalled();
  });
});
