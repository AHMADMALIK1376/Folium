import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PAGE_SETUP, type PageSetup } from "@/lib/editor/pageSetup";

import { PageSetupControl } from "./PageSetupControl";

async function open(setup: PageSetup = DEFAULT_PAGE_SETUP) {
  const onChange = vi.fn();
  render(<PageSetupControl setup={setup} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /page setup/i }));
  return onChange;
}

describe("PageSetupControl", () => {
  it("says the paper and the preset without being opened", () => {
    render(<PageSetupControl setup={DEFAULT_PAGE_SETUP} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /page setup/i })).toHaveTextContent(
      /A4.*Normal/,
    );
  });

  it("calls custom margins Custom rather than guessing a preset", () => {
    render(
      <PageSetupControl
        setup={{ ...DEFAULT_PAGE_SETUP, margins: { top: 1, right: 1.1, bottom: 1, left: 1 } }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /page setup/i })).toHaveTextContent(/Custom/);
  });

  it("offers Word's presets", async () => {
    await open();

    const presets = screen.getByRole("group", { name: /margin presets/i });
    for (const name of ["Normal", "Narrow", "Moderate", "Wide", "Office 2003 Default"]) {
      expect(presets).toHaveTextContent(name);
    }
  });

  it("does not offer Mirrored", async () => {
    // It sets an Inside and an Outside margin, which needs to know whether a
    // page is odd or even -- and without pagination there are no page numbers
    // to be either. Offering it would draw something identical to Normal and
    // claim to be doing more.
    await open();

    expect(
      screen.getByRole("group", { name: /margin presets/i }),
    ).not.toHaveTextContent(/mirrored/i);
  });

  it("applies a preset", async () => {
    const onChange = await open();

    await userEvent.click(screen.getByRole("button", { name: /narrow/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } }),
    );
  });

  it("marks the preset in force", async () => {
    await open({ ...DEFAULT_PAGE_SETUP, margins: { top: 1, right: 2, bottom: 1, left: 2 } });

    expect(screen.getByRole("button", { name: /wide/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^normal/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("changes the paper and the orientation", async () => {
    const onChange = await open();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /page size/i }), "legal");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ size: "legal" }));

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /orientation/i }),
      "landscape",
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: "landscape" }),
    );
  });

  it("commits a custom margin on blur, not on every keystroke", async () => {
    const onChange = await open();
    const field = screen.getByRole("spinbutton", { name: /left margin/i });

    await userEvent.clear(field);
    await userEvent.type(field, "0.75");

    // "0", "0.", "0.7" are all legal margins on the way to 0.75. Saving each
    // would redraw the page three times and send three writes nobody asked for.
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ margins: expect.objectContaining({ left: 0.75 }) }),
    );
  });

  it("keeps the old value when a field is left unreadable", async () => {
    const onChange = await open();
    const field = screen.getByRole("spinbutton", { name: /top margin/i });

    await userEvent.clear(field);
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("says plainly that it does not paginate", async () => {
    // The limit is worth one sentence where the setting is chosen, rather than
    // being discovered when a printed page does not match.
    await open();

    expect(screen.getByText(/does not split a document into numbered pages/i)).toBeVisible();
  });
});
