import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCallback } from "react";
import {
  useEffectStream,
  usePipe,
  useSubscription,
} from "../src/hooks.js";
import { pipe } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Repro for the documented composition:
 *   useEffectStream → usePipe → useSubscription
 *
 * The library README states "Emits the dependency array as an observable
 * whenever any dependency changes." A user composing the documented hooks
 * directly should not silently lose emissions.
 */
describe("useEffectStream → usePipe → useSubscription composition", () => {
  it("delivers the mount emission to a stable observer", () => {
    const received: number[] = [];
    const observer = (v: [number]) => {
      received.push(v[0]);
    };

    renderHook(({ x }: { x: number }) => {
      const deps$ = useEffectStream([x]);
      const piped$ = usePipe(deps$, pipe(map((v: [number]) => v)));
      useSubscription(piped$, observer);
    }, { initialProps: { x: 1 } });

    expect(received).toEqual([1]);
  });

  it("delivers all emissions across rerenders to a stable observer", () => {
    const received: number[] = [];
    const observer = (v: [number]) => {
      received.push(v[0]);
    };

    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream([x]);
        const piped$ = usePipe(deps$, pipe(map((v: [number]) => v)));
        useSubscription(piped$, observer);
      },
      { initialProps: { x: 1 } },
    );

    rerender({ x: 2 });
    rerender({ x: 3 });

    expect(received).toEqual([1, 2, 3]);
  });

  it("delivers all emissions across rerenders even with an unstable observer", () => {
    const received: number[] = [];

    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream([x]);
        const piped$ = usePipe(deps$, pipe(map((v: [number]) => v)));
        // Inline observer — recreated each render. This is the React-idiomatic default.
        useSubscription(piped$, (v: [number]) => {
          received.push(v[0]);
        });
      },
      { initialProps: { x: 1 } },
    );

    rerender({ x: 2 });
    rerender({ x: 3 });

    expect(received).toEqual([1, 2, 3]);
  });

  it("delivers emissions when the observer is stabilised via useCallback", () => {
    const received: number[] = [];

    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream([x]);
        const piped$ = usePipe(deps$, pipe(map((v: [number]) => v)));
        const observer = useCallback((v: [number]) => {
          received.push(v[0]);
        }, []);
        useSubscription(piped$, observer);
      },
      { initialProps: { x: 1 } },
    );

    rerender({ x: 2 });
    rerender({ x: 3 });

    expect(received).toEqual([1, 2, 3]);
  });
});
