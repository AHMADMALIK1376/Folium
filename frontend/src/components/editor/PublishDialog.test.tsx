import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { Features, PublishResult, PublishStatus } from "@/lib/api/types";

const getPublishStatus = vi.fn();
const publishDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  getPublishStatus: (...a: unknown[]) => getPublishStatus(...a),
  publishDocument: (...a: unknown[]) => publishDocument(...a),
}));

const getFeatures = vi.fn();
vi.mock("@/lib/api/features", () => ({ getFeatures: () => getFeatures() }));

const { PublishDialog } = await import("./PublishDialog");
const { resetFeaturesCache } = await import("@/lib/hooks/useFeatures");

const features = (over: Partial<Features> = {}): Features => ({
  collaboration: true,
  attachments: true,
  github_publish: true,
  ...over,
});

const status = (over: Partial<PublishStatus> = {}): PublishStatus => ({
  configured: true,
  can_publish: true,
  repo: "curavine/docs",
  branch: "main",
  path: "docs/tech-stack.md",
  is_published: false,
  last_published_at: null,
  last_published_by: null,
  file_url: null,
  ...over,
});

const result: PublishResult = {
  path: "docs/tech-stack.md",
  commit_sha: "abc123",
  commit_url: "https://github.com/curavine/docs/commit/abc123",
  file_url: "https://github.com/curavine/docs/blob/main/docs/tech-stack.md",
  blob_sha: "def456",
  published_at: "2026-10-29T10:00:00Z",
  published_by: { id: "u1", display_name: "Alice" },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetFeaturesCache();
  getFeatures.mockResolvedValue(features());
  getPublishStatus.mockResolvedValue(status());
});

async function openDialog(permission: "owner" | "edit" | "comment" | "view" = "owner") {
  render(<PublishDialog documentId="doc-1" permission={permission} />);
  await userEvent.click(await screen.findByRole("button", { name: /publish to github/i }));
  return screen.findByRole("dialog");
}

describe("PublishDialog", () => {
  it.each(["view", "comment"] as const)("is hidden for a %s permission", async (permission) => {
    render(<PublishDialog documentId="doc-1" permission={permission} />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /publish to github/i })).toBeNull();
  });

  it.each(["owner", "edit"] as const)("is offered to a %s", async (permission) => {
    render(<PublishDialog documentId="doc-1" permission={permission} />);

    expect(await screen.findByRole("button", { name: /publish to github/i })).toBeInTheDocument();
  });

  it("is hidden when GitHub is not configured", async () => {
    getFeatures.mockResolvedValue(features({ github_publish: false }));
    render(<PublishDialog documentId="doc-1" permission="owner" />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /publish to github/i })).toBeNull();
  });

  it("is hidden when the features could not be loaded", async () => {
    getFeatures.mockRejectedValue(new ApiError(500, "boom"));
    render(<PublishDialog documentId="doc-1" permission="owner" />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /publish to github/i })).toBeNull();
  });

  it("pre-fills the path from the saved status and lets it be changed", async () => {
    await openDialog();

    const input = await screen.findByDisplayValue("docs/tech-stack.md");
    await userEvent.clear(input);
    await userEvent.type(input, "docs/other.md");
    publishDocument.mockResolvedValue(result);
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    expect(publishDocument).toHaveBeenCalledWith("doc-1", "docs/other.md", false);
  });

  it("shows the commit link after a successful publish", async () => {
    publishDocument.mockResolvedValue(result);
    const onPublished = vi.fn();
    render(<PublishDialog documentId="doc-1" permission="owner" onPublished={onPublished} />);
    await userEvent.click(await screen.findByRole("button", { name: /publish to github/i }));
    await screen.findByDisplayValue("docs/tech-stack.md");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    const link = await screen.findByRole("link", { name: /view commit/i });
    expect(link).toHaveAttribute("href", result.commit_url);
    expect(onPublished).toHaveBeenCalled();
  });

  it("offers Cancel or Overwrite when the file changed in GitHub", async () => {
    publishDocument.mockRejectedValueOnce(
      new ApiError(409, "This file was changed in GitHub since the last publish."),
    );
    await openDialog();
    await screen.findByDisplayValue("docs/tech-stack.md");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/changed in GitHub since the last publish/i);

    publishDocument.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: /overwrite/i }));

    expect(publishDocument).toHaveBeenLastCalledWith("doc-1", "docs/tech-stack.md", true);
    expect(await screen.findByRole("link", { name: /view commit/i })).toBeInTheDocument();
  });

  it("Cancel dismisses the conflict without publishing again", async () => {
    publishDocument.mockRejectedValue(new ApiError(409, "changed"));
    await openDialog();
    await screen.findByDisplayValue("docs/tech-stack.md");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(publishDocument).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own message for a rejected path", async () => {
    publishDocument.mockRejectedValue(new ApiError(422, "The file name must end in .md"));
    await openDialog();
    await screen.findByDisplayValue("docs/tech-stack.md");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    expect(await screen.findByText(/must end in \.md/i)).toBeInTheDocument();
  });

  it("warns about formatting Markdown drops, and says it is a snapshot", async () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "x" }] },
      ],
    };
    render(<PublishDialog documentId="doc-1" permission="owner" content={content} />);
    await userEvent.click(await screen.findByRole("button", { name: /publish to github/i }));

    expect(await screen.findByRole("note")).toHaveTextContent(/alignment/i);
    expect(screen.getByText(/publishes a snapshot/i)).toBeInTheDocument();
  });

  it("says when and by whom it was last published", async () => {
    getPublishStatus.mockResolvedValue(
      status({
        is_published: true,
        last_published_at: "2026-10-29T10:00:00Z",
        last_published_by: { id: "u1", display_name: "Alice" },
      }),
    );
    await openDialog();

    expect(await screen.findByText(/last published/i)).toHaveTextContent(/by Alice/);
  });
});
