import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
  it("says Live when connected", () => {
    render(<ConnectionStatus status="connected" />);
    expect(screen.getByRole("status")).toHaveTextContent(/^live$/i);
  });

  it("says so while connecting", () => {
    render(<ConnectionStatus status="connecting" />);
    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("does not stay silent when the connection has dropped", () => {
    // The 4-i behaviour was nothing at all here, so a disconnected editor
    // looked exactly like a live one.
    render(<ConnectionStatus status="offline" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/offline/i);
    expect(status).toHaveTextContent(/reconnecting/i);
  });

  it("announces changes to a screen reader", () => {
    render(<ConnectionStatus status="offline" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
