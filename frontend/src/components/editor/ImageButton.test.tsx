import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadAttachment = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
  attachmentRawUrl: (id: string, attachmentId: string) =>
    `/api/v1/documents/${id}/attachments/${attachmentId}/raw`,
}));

const { ImageButton } = await import("./ImageButton");

function makeEditor() {
  const called: string[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, property: string) => {
        if (property === "run") return () => true;
        return (...args: unknown[]) => {
          called.push(args.length ? `${property}:${JSON.stringify(args[0])}` : property);
          return chain;
        };
      },
    },
  );
  return { called, editor: { chain: () => chain } };
}

function png(name = "photo.png") {
  return new File([new Uint8Array(8)], name, { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadAttachment.mockResolvedValue({ id: "att-1" });
});

describe("ImageButton", () => {
  it("uploads the image and inserts the stable raw URL", async () => {
    // Not a signed URL: one embedded in the document would render for five
    // minutes and be broken forever after, including in every version snapshot.
    const { editor, called } = makeEditor();
    render(<ImageButton editor={editor as never} documentId="doc-1" />);

    await userEvent.upload(screen.getByTestId("image-input"), png());

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        called.some((c) =>
          c.includes("/api/v1/documents/doc-1/attachments/att-1/raw"),
        ),
      ).toBe(true),
    );
  });

  it("defaults alt text to the filename rather than leaving it empty", async () => {
    // An image with no alt text is invisible to a screen reader, and an editor
    // that makes that the easy path makes its users' documents worse.
    const { editor, called } = makeEditor();
    render(<ImageButton editor={editor as never} documentId="doc-1" />);

    await userEvent.upload(screen.getByTestId("image-input"), png("diagram.png"));

    await waitFor(() =>
      expect(called.some((c) => c.includes("diagram.png"))).toBe(true),
    );
  });

  it("refuses a non-image without calling the API", async () => {
    const { editor } = makeEditor();
    render(<ImageButton editor={editor as never} documentId="doc-1" />);

    await userEvent.upload(
      screen.getByTestId("image-input"),
      new File(["x"], "notes.pdf", { type: "application/pdf" }),
      { applyAccept: false },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/not an image/i);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("refuses an SVG, which the backend also refuses", async () => {
    // SVG can carry script, and these are served from a URL the reader opens.
    const { editor } = makeEditor();
    render(<ImageButton editor={editor as never} documentId="doc-1" />);

    await userEvent.upload(
      screen.getByTestId("image-input"),
      new File(["<svg/>"], "art.svg", { type: "image/svg+xml" }),
      { applyAccept: false },
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("reports a failed upload without inserting anything", async () => {
    uploadAttachment.mockRejectedValue(new Error("offline"));
    const { editor, called } = makeEditor();
    render(<ImageButton editor={editor as never} documentId="doc-1" />);

    await userEvent.upload(screen.getByTestId("image-input"), png());

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not insert/i);
    expect(called.some((c) => c.startsWith("setImage"))).toBe(false);
  });
});
