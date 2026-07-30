import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./useAutosave";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advance past the debounce and let the resulting promise settle. */
async function settle(ms = 800) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useAutosave", () => {
  it("coalesces a burst of changes into one save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    // Eight keystrokes in quick succession must not be eight PATCHes.
    act(() => {
      for (const text of ["a", "ab", "abc", "abcd", "abcde", "abcdef", "abcdefg", "h"]) {
        result.current.schedule({ title: text });
      }
    });
    await settle();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves the newest change, not the one that started the timer", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => {
      result.current.schedule({ title: "first" });
      result.current.schedule({ title: "second" });
    });
    await settle();

    expect(save).toHaveBeenCalledWith({ title: "second" }, undefined);
  });

  it("merges different fields changed in the same window", async () => {
    // Renaming and typing within the debounce is one PATCH carrying both, not a
    // title save that discards the content edit.
    const save = vi.fn().mockResolvedValue(undefined);
    const content = { type: "doc" as const, content: [] };
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => {
      result.current.schedule({ title: "Renamed" });
      result.current.schedule({ content });
    });
    await settle();

    expect(save).toHaveBeenCalledWith({ title: "Renamed", content }, undefined);
  });

  it("reports unsaved, then saving, then saved", async () => {
    let release: () => void = () => {};
    const save = vi.fn().mockReturnValue(new Promise<void>((r) => (release = r)));
    const { result } = renderHook(() => useAutosave({ save }));

    expect(result.current.status).toBe("saved");

    act(() => result.current.schedule({ title: "x" }));
    expect(result.current.status).toBe("unsaved");

    await settle();
    expect(result.current.status).toBe("saving");

    await act(async () => {
      release();
    });
    expect(result.current.status).toBe("saved");
  });

  it("never reads as saved when the save failed", async () => {
    // The one thing an autosaving editor must not do is tell the user their work
    // is safe when it is not.
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => result.current.schedule({ title: "x" }));
    await settle();

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("clears a failure once a later save succeeds", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => result.current.schedule({ title: "x" }));
    await settle();
    expect(result.current.status).toBe("failed");

    act(() => result.current.schedule({ title: "y" }));
    await settle();

    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("flushes a pending change immediately, with keepalive", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => result.current.schedule({ title: "pending" }));
    // No timer advance: the flush must not wait for the debounce, because the
    // page is going away.
    await act(async () => {
      result.current.flush();
    });

    expect(save).toHaveBeenCalledWith({ title: "pending" }, { keepalive: true });
  });

  it("does not flush when nothing is pending", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    await act(async () => {
      result.current.flush();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("does not flush the same change twice", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => result.current.schedule({ title: "once" }));
    await act(async () => {
      result.current.flush();
    });
    // The debounced timer must have been cancelled by the flush.
    await settle();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending save when unmounted", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutosave({ save }));

    act(() => result.current.schedule({ title: "x" }));
    unmount();
    await settle();

    expect(save).not.toHaveBeenCalled();
  });
});
