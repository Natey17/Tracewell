import { useEffect, useRef, useState } from "react";

interface PollingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []): PollingState<T> {
  const [state, setState] = useState<PollingState<T>>({ data: null, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err), loading: false }));
      }
    }

    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return state;
}
