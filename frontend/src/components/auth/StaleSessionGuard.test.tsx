import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaleSessionGuard } from "./StaleSessionGuard";

const reload = vi.fn();
let originalLocation: Location;

beforeEach(() => {
  reload.mockClear();
  originalLocation = window.location;
  // jsdom's location.reload is not writable, so the whole object is replaced
  // and restored afterwards rather than patched in place.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

function firePageShow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("StaleSessionGuard", () => {
  it("reloads a page restored from the back/forward cache", () => {
    // Without this, Back after signing out paints the previous session's
    // documents straight out of the restored JS heap.
    render(<StaleSessionGuard />);
    firePageShow(true);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on an ordinary load", () => {
    // pageshow fires on every load. Reloading on all of them would loop.
    render(<StaleSessionGuard />);
    firePageShow(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<StaleSessionGuard />);
    unmount();
    firePageShow(true);

    expect(reload).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<StaleSessionGuard />);
    expect(container).toBeEmptyDOMElement();
  });
});
