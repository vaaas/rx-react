import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCallback } from "react";
import {
  useEffectStream,
  useObservable,
  useSubscription,
} from "../src/hooks.js";
import { map } from "rxjs/operators";

/**
 * Repro for the documented composition:
 *   useEffectStream → useObservable → useSubscription
 *
 * A user composing the documented hooks directly should not silently lose
 * emissions, regardless of whether the observer is stable or recreated each
 * render.
 */
describe("useEffectStream → useObservable → useSubscription composition", () => {
  it("delivers the mount emission to a stable observer", () => {
    const received: number[] = [];
    const observer = (v: number) => {
      received.push(v);
    };

    renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream(x);
        const piped$ = useObservable(() => deps$.pipe(map((v) => v)));
        useSubscription(piped$, observer);
      },
      { initialProps: { x: 1 } },
    );

    expect(received).toEqual([1]);
  });

  it("delivers all emissions across rerenders to a stable observer", () => {
    const received: number[] = [];
    const observer = (v: number) => {
      received.push(v);
    };

    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream(x);
        const piped$ = useObservable(() => deps$.pipe(map((v) => v)));
        useSubscription(piped$, observer);
      },
      { initialProps: { x: 1 } },
    );

    rerender({ x: 2 });
    rerender({ x: 3 });

    expect(received).toEqual([1, 2, 3]);
  });

  it("delivers all emissions across rerenders even with an inline observer", () => {
    const received: number[] = [];

    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        const deps$ = useEffectStream(x);
        const piped$ = useObservable(() => deps$.pipe(map((v) => v)));
        useSubscription(piped$, (v: number) => {
          received.push(v);
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
        const deps$ = useEffectStream(x);
        const piped$ = useObservable(() => deps$.pipe(map((v) => v)));
        const observer = useCallback((v: number) => {
          received.push(v);
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
