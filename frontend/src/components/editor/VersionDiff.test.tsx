import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VersionDiff } from "./VersionDiff";

describe("VersionDiff", () => {
  it("says plainly when nothing changed", () => {
    // Rather than rendering 900 unchanged words and leaving the reader to
    // conclude nothing happened.
    render(<VersionDiff segments={[{ op: "equal", text: "same" }]} added={0} removed={0} />);

    expect(screen.getByText(/no text has changed/i)).toBeInTheDocument();
  });

  it("summarises the counts, which is usually the whole answer", () => {
    render(
      <VersionDiff
        segments={[
          { op: "equal", text: "the " },
          { op: "removed", text: "quick" },
          { op: "added", text: "slow" },
        ]}
        added={1}
        removed={1}
      />,
    );

    expect(screen.getByText(/1 added/)).toBeInTheDocument();
    expect(screen.getByText(/1 removed/)).toBeInTheDocument();
  });

  it("marks additions and removals with elements, not colour alone", () => {
    // Colour alone fails for the eight percent of men with a colour vision
    // deficiency, and "what changed" is exactly what they would lose. <ins> and
    // <del> carry the meaning semantically, and are underlined and struck
    // through visually.
    const { container } = render(
      <VersionDiff
        segments={[
          { op: "removed", text: "gone" },
          { op: "added", text: "new" },
        ]}
        added={1}
        removed={1}
      />,
    );

    const inserted = container.querySelector("ins");
    const deleted = container.querySelector("del");

    expect(inserted).toHaveTextContent("new");
    expect(deleted).toHaveTextContent("gone");
    expect(inserted?.className).toMatch(/underline/);
    expect(deleted?.className).toMatch(/line-through/);
  });

  it("renders unchanged text as plain text", () => {
    const { container } = render(
      <VersionDiff
        segments={[{ op: "equal", text: "untouched" }]}
        added={1}
        removed={0}
      />,
    );

    expect(screen.getByText(/untouched/)).toBeInTheDocument();
    expect(container.querySelector("ins")).toBeNull();
    expect(container.querySelector("del")).toBeNull();
  });

  it("preserves whitespace so the text stays readable", () => {
    // The backend tokenises whitespace precisely so segments rebuild the text
    // exactly; collapsing it here would throw that away at the last step.
    const { container } = render(
      <VersionDiff
        segments={[{ op: "equal", text: "line one\n\nline two" }]}
        added={1}
        removed={0}
      />,
    );

    expect(container.querySelector(".whitespace-pre-wrap")).not.toBeNull();
  });
});
