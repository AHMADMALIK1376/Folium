import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./useHydrated";

describe("useHydrated", () => {
  it("is false on the first render and true afterwards", () => {
    // Recording every render's value, because the contract is specifically about
    // the first one: that is the window in which a form submit would bypass
    // React and put the password in a query string.
    const seen: boolean[] = [];

    function Probe() {
      const hydrated = useHydrated();
      seen.push(hydrated);
      return <span>{hydrated ? "ready" : "waiting"}</span>;
    }

    render(<Probe />);

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
