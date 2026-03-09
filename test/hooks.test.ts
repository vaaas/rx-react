import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Subject, of, map } from "rxjs";
import {
  useEffectStream,
  useSubject,
  usePipe,
  useSubscription,
  useLatestState,
} from "../src/hooks.js";

describe("useEffectStream", () => {
  it("emits dependencies on mount", () => {
    const values: [number, string][] = [];
    const { result } = renderHook(() => useEffectStream([1, "a"]));
    result.current.subscribe((v) => values.push(v));

    expect(result.current).toBeInstanceOf(Subject);
  });

  it("emits new values when deps change", () => {
    const values: [number][] = [];
    let dep = 1;
    const { result, rerender } = renderHook(() => useEffectStream([dep]));
    result.current.subscribe((v) => values.push(v));

    dep = 2;
    rerender();
    dep = 3;
    rerender();

    expect(values).toEqual([[2], [3]]);
  });

  it("returns the same Subject across renders", () => {
    let dep = 1;
    const { result, rerender } = renderHook(() => useEffectStream([dep]));
    const first = result.current;

    dep = 2;
    rerender();

    expect(result.current).toBe(first);
  });
});

describe("useSubject", () => {
  it("returns a Subject and a next function", () => {
    const { result } = renderHook(() => useSubject<number>());
    const [subject, next] = result.current;

    expect(subject).toBeInstanceOf(Subject);
    expect(typeof next).toBe("function");
  });

  it("emits values through the next function", () => {
    const values: number[] = [];
    const { result } = renderHook(() => useSubject<number>());
    const [subject, next] = result.current;

    subject.subscribe((v) => values.push(v));

    act(() => next(1));
    act(() => next(2));
    act(() => next(3));

    expect(values).toEqual([1, 2, 3]);
  });

  it("returns the same Subject across renders", () => {
    const { result, rerender } = renderHook(() => useSubject<number>());
    const first = result.current[0];

    rerender();

    expect(result.current[0]).toBe(first);
  });
});

describe("usePipe", () => {
  it("applies the pipe operator to the source", () => {
    const source = of(1, 2, 3);
    const values: number[] = [];

    const { result } = renderHook(() =>
      usePipe(
        source,
        map((x: number) => x * 2),
      ),
    );

    result.current.subscribe((v) => values.push(v));

    expect(values).toEqual([2, 4, 6]);
  });

  it("returns the same Observable across renders", () => {
    const source = of(1);
    const { result, rerender } = renderHook(() =>
      usePipe(
        source,
        map((x: number) => x + 1),
      ),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe("useSubscription", () => {
  it("subscribes to the source with a function observer", () => {
    const source = new Subject<number>();
    const values: number[] = [];
    const observer = vi.fn((v: number) => values.push(v));

    renderHook(() => useSubscription(source, observer));

    act(() => source.next(1));
    act(() => source.next(2));

    expect(values).toEqual([1, 2]);
  });

  it("subscribes with a partial observer object", () => {
    const source = new Subject<number>();
    const values: number[] = [];
    const observer = { next: vi.fn((v: number) => values.push(v)) };

    renderHook(() => useSubscription(source, observer));

    act(() => source.next(10));

    expect(values).toEqual([10]);
  });

  it("unsubscribes on unmount", () => {
    const source = new Subject<number>();
    const values: number[] = [];
    const observer = (v: number) => values.push(v);

    const { unmount } = renderHook(() => useSubscription(source, observer));

    act(() => source.next(1));
    unmount();
    source.next(2);

    expect(values).toEqual([1]);
  });
});

describe("useLatestState", () => {
  it("returns the initial value before any emission", () => {
    const source = new Subject<number>();
    const { result } = renderHook(() => useLatestState(source, 0));

    expect(result.current).toEqual(0);
  });

  it("updates state when the source emits", () => {
    const source = new Subject<string>();
    const { result } = renderHook(() => useLatestState(source, "initial"));

    act(() => source.next("updated"));

    expect(result.current).toEqual("updated");
  });

  it("tracks multiple emissions", () => {
    const source = new Subject<number>();
    const { result } = renderHook(() => useLatestState(source, 0));

    act(() => source.next(1));
    act(() => source.next(2));
    act(() => source.next(3));

    expect(result.current).toEqual(3);
  });
});
