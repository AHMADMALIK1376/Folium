import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATA_NOTICE, DataNotice, DataNoticeBanner } from "./DataNotice";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("DataNotice", () => {
  it("states the rule", () => {
    render(<DataNotice />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "For design documents only. Do not store patient or personal health data in Folium.",
    );
  });
});

describe("DataNoticeBanner", () => {
  it("shows the full rule, and collapses and expands", async () => {
    render(<DataNoticeBanner />);
    expect(screen.getByText(DATA_NOTICE)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText(DATA_NOTICE)).toBeNull();
    expect(screen.getByText(/design documents only/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.getByText(DATA_NOTICE)).toBeInTheDocument();
  });

  it("remembers a collapse", async () => {
    const first = render(<DataNoticeBanner />);
    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    first.unmount();

    render(<DataNoticeBanner />);

    expect(await screen.findByRole("button", { name: /show/i })).toBeInTheDocument();
  });

  it("still works when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<DataNoticeBanner />);
    expect(screen.getByText(DATA_NOTICE)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText(DATA_NOTICE)).toBeNull();
  });
});
