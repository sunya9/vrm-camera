import { useState, useEffect, useRef, useCallback } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for managing async resources with automatic cleanup.
 * Similar to TanStack Query but for local async operations.
 *
 * - Re-runs when `deps` change
 * - Calls `dispose` on previous data when re-running or unmounting
 * - Handles cancellation for StrictMode double-invocation
 */
export function useAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  options: {
    deps: unknown[];
    dispose?: (data: T) => void;
    enabled?: boolean;
  },
): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, "reset">>({
    data: null,
    loading: false,
    error: null,
  });
  const dataRef = useRef<T | null>(null);
  const { deps, dispose, enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      // Clean up previous data when disabled
      if (dataRef.current && dispose) {
        dispose(dataRef.current);
      }
      dataRef.current = null;
      setState({ data: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    factory(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          dispose?.(result);
          return;
        }
        // Dispose previous
        if (dataRef.current && dispose) {
          dispose(dataRef.current);
        }
        dataRef.current = result;
        setState({ data: result, loading: false, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: err });
      });

    return () => {
      controller.abort();
      if (dataRef.current && dispose) {
        dispose(dataRef.current);
      }
      dataRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const reset = useCallback(() => {
    if (dataRef.current && dispose) {
      dispose(dataRef.current);
    }
    dataRef.current = null;
    setState({ data: null, loading: false, error: null });
  }, [dispose]);

  return { ...state, reset };
}
