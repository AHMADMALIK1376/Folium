import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getFeatures = vi.fn();
vi.mock("@/lib/api/features", () => ({ getFeatures: () => getFeatures() }));

const { AttachmentsOffNote, CollaborationOffNote } = await import("./FeatureNotes");
const { resetFeaturesCache } = await import("@/lib/hooks/useFeatures");

const features = (collaboration: boolean) => ({
  collaboration,
  attachments: true,
  github_publish: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetFeaturesCache();
});

describe("CollaborationOffNote", () => {
  it("warns an editor when live editing is off", async () => {
    getFeatures.mockResolvedValue(features(false));
    render(<CollaborationOffNote editable />);

    expect(await screen.findByRole("note")).toHaveTextContent(
      "Live editing is off — edits by two people at the same time can overwrite each other",
    );
  });

  it("says nothing when live editing is on", async () => {
    getFeatures.mockResolvedValue(features(true));
    render(<CollaborationOffNote editable />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says nothing to someone who cannot edit", async () => {
    getFeatures.mockResolvedValue(features(false));
    render(<CollaborationOffNote editable={false} />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says nothing when the features could not be loaded", async () => {
    getFeatures.mockRejectedValue(new Error("down"));
    render(<CollaborationOffNote editable />);

    await waitFor(() => expect(getFeatures).toHaveBeenCalled());
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("AttachmentsOffNote", () => {
  it("explains why there is no attachments panel", () => {
    render(<AttachmentsOffNote enabled={false} />);

    expect(screen.getByRole("note")).toHaveTextContent(/attachments are off/i);
  });

  it("is absent when attachments work", () => {
    render(<AttachmentsOffNote enabled />);

    expect(screen.queryByRole("note")).toBeNull();
  });
});
