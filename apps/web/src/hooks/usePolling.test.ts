import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "./usePolling";

describe("usePolling", () => {
  it("fetches immediately and exposes the resolved data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });
    const { result } = renderHook(() => usePolling(fetcher, 10_000));

    await waitFor(() => expect(result.current.data).toEqual({ value: 1 }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("starts in a loading state before the first fetch resolves", () => {
    const fetcher = vi.fn(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePolling(fetcher, 10_000));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("captures a rejected fetch as an error message instead of throwing", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => usePolling(fetcher, 10_000));

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.loading).toBe(false);
  });

  it("polls again after the interval elapses", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");
    renderHook(() => usePolling(fetcher, 20));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("stops polling once unmounted", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");
    const { unmount } = renderHook(() => usePolling(fetcher, 20));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    unmount();
    const callsAtUnmount = fetcher.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fetcher.mock.calls.length).toBe(callsAtUnmount);
  });

  it("re-fetches immediately when a dependency changes", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");
    const { rerender } = renderHook(({ dep }: { dep: number }) => usePolling(fetcher, 10_000, [dep]), {
      initialProps: { dep: 1 },
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ dep: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
