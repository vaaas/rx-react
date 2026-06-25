import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BehaviorSubject, Subject, combineLatest, of, map } from "rxjs";
import {
  useConstant,
  useEffectStream,
  useSubject,
  useBehaviorSubject,
  useObservable,
  useSubscription,
  useLatestState,
} from "../src/hooks.js";

describe("useConstant", () => {
  it("returns the factory result", () => {
    const { result } = renderHook(() => useConstant(() => ({ count: 0 })));

    expect(result.current).toEqual({ count: 0 });
  });

  it("returns the same value across renders", () => {
    const { result, rerender } = renderHook(() => useConstant(() => ({})));
    const first = result.current;

    rerender();
    rerender();

    expect(result.current).toBe(first);
  });

  it("runs the factory exactly once per component instance", () => {
    const factory = vi.fn(() => 42);
    const { rerender } = renderHook(() => useConstant(factory));

    rerender();
    rerender();

    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("useEffectStream", () => {
  it("emits a scalar when called with a single argument", () => {
    const values: number[] = [];
    const { result } = renderHook(() => useEffectStream(1));
    result.current.subscribe((v) => values.push(v));

    expect(result.current).toBeInstanceOf(BehaviorSubject);
    expect(values).toEqual([1]);
  });

  it("emits a tuple when called with multiple arguments", () => {
    const values: [number, string][] = [];
    const { result } = renderHook(() => useEffectStream(1, "a"));
    result.current.subscribe((v) => values.push(v));

    expect(values).toEqual([[1, "a"]]);
  });

  it("emits new scalar values when the dep changes", () => {
    const values: number[] = [];
    let dep = 1;
    const { result, rerender } = renderHook(() => useEffectStream(dep));
    result.current.subscribe((v) => values.push(v));

    dep = 2;
    rerender();
    dep = 3;
    rerender();

    expect(values).toEqual([1, 2, 3]);
  });

  it("emits new tuples when any dep changes", () => {
    const values: [number, string][] = [];
    let a = 1;
    let b = "a";
    const { result, rerender } = renderHook(() => useEffectStream(a, b));
    result.current.subscribe((v) => values.push(v));

    a = 2;
    rerender();
    b = "b";
    rerender();

    expect(values).toEqual([
      [1, "a"],
      [2, "a"],
      [2, "b"],
    ]);
  });

  it("returns the same BehaviorSubject across renders", () => {
    let dep = 1;
    const { result, rerender } = renderHook(() => useEffectStream(dep));
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

describe("useBehaviorSubject", () => {
  it("returns a BehaviorSubject seeded with the initial value", () => {
    const { result } = renderHook(() => useBehaviorSubject(42));

    expect(result.current).toBeInstanceOf(BehaviorSubject);
    expect(result.current.value).toEqual(42);
  });

  it("supports a lazy initializer that runs once", () => {
    const init = vi.fn(() => ({ count: 0 }));
    const { result, rerender } = renderHook(() => useBehaviorSubject(init));

    expect(result.current.value).toEqual({ count: 0 });
    rerender();
    rerender();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it("returns the same BehaviorSubject across renders", () => {
    const { result, rerender } = renderHook(() => useBehaviorSubject(0));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("emits new values when .next is called", () => {
    const values: number[] = [];
    const { result } = renderHook(() => useBehaviorSubject(1));
    result.current.subscribe((v) => values.push(v));

    act(() => result.current.next(2));
    act(() => result.current.next(3));

    expect(values).toEqual([1, 2, 3]);
    expect(result.current.value).toEqual(3);
  });
});

describe("useObservable", () => {
  it("returns the observable produced by the factory", () => {
    const source = of(1, 2, 3);
    const values: number[] = [];

    const { result } = renderHook(() =>
      useObservable(() => source.pipe(map((x) => x * 2))),
    );

    result.current.subscribe((v) => values.push(v));

    expect(values).toEqual([2, 4, 6]);
  });

  it("returns the same Observable across renders", () => {
    const source = of(1);
    const { result, rerender } = renderHook(() =>
      useObservable(() => source.pipe(map((x) => x + 1))),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("runs the factory exactly once per component instance", () => {
    const factory = vi.fn(() => of(1));
    const { rerender } = renderHook(() => useObservable(factory));

    rerender();
    rerender();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("supports multi-source derivations via combineLatest", () => {
    const a$ = new BehaviorSubject(1);
    const b$ = new BehaviorSubject(10);
    const values: number[] = [];

    const { result } = renderHook(() =>
      useObservable(() =>
        combineLatest([a$, b$]).pipe(map(([a, b]) => a + b)),
      ),
    );
    result.current.subscribe((v) => values.push(v));

    act(() => a$.next(2));
    act(() => b$.next(20));

    expect(values).toEqual([11, 12, 22]);
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

  it("forwards error and complete to partial observers", () => {
    const source = new Subject<number>();
    const onError = vi.fn();
    const onComplete = vi.fn();

    renderHook(() =>
      useSubscription(source, {
        next: () => {},
        error: onError,
        complete: onComplete,
      }),
    );

    act(() => source.error(new Error("boom")));
    expect(onError).toHaveBeenCalledOnce();
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

  it("does not resubscribe when only the observer identity changes", () => {
    const source = new BehaviorSubject(0);
    const subscribeSpy = vi.spyOn(source, "subscribe");
    let captured: number | undefined;

    const { rerender } = renderHook(
      ({ tag }: { tag: number }) =>
        useSubscription(source, (v: number) => {
          // Inline arrow: a new function each render. Closes over `tag`.
          captured = v + tag;
        }),
      { initialProps: { tag: 100 } },
    );

    const callsAfterMount = subscribeSpy.mock.calls.length;

    rerender({ tag: 200 });
    rerender({ tag: 300 });

    expect(subscribeSpy.mock.calls.length).toEqual(callsAfterMount);

    act(() => source.next(5));
    expect(captured).toEqual(305);
  });

  it("resubscribes when source changes", () => {
    const a = new BehaviorSubject(1);
    const b = new BehaviorSubject(2);
    const values: number[] = [];

    const { rerender } = renderHook(
      ({ source }: { source: BehaviorSubject<number> }) =>
        useSubscription(source, (v: number) => values.push(v)),
      { initialProps: { source: a } },
    );

    rerender({ source: b });

    expect(values).toEqual([1, 2]);
  });
});

describe("useLatestState", () => {
  it("returns the initial value before any emission (plain Observable)", () => {
    const source = new Subject<number>();
    const { result } = renderHook(() => useLatestState(source, 0));

    expect(result.current).toEqual(0);
  });

  it("seeds from BehaviorSubject.value without an initial arg", () => {
    const source = new BehaviorSubject<number>(7);
    const { result } = renderHook(() => useLatestState(source));

    expect(result.current).toEqual(7);
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

  it("tracks emissions from a BehaviorSubject without flashing undefined", () => {
    const source = new BehaviorSubject(0);
    const { result } = renderHook(() => useLatestState(source));

    expect(result.current).toEqual(0);
    act(() => source.next(1));
    expect(result.current).toEqual(1);
  });

  it("reflects the new source's current value when the source is swapped", () => {
    const a = new BehaviorSubject(1);
    const b = new BehaviorSubject(99);

    const { result, rerender } = renderHook(
      ({ source }: { source: BehaviorSubject<number> }) =>
        useLatestState(source),
      { initialProps: { source: a } },
    );

    expect(result.current).toEqual(1);

    rerender({ source: b });

    expect(result.current).toEqual(99);
  });

  it("resubscribes to the new source and ignores the old one after a swap", () => {
    const a = new BehaviorSubject(1);
    const b = new BehaviorSubject(10);

    const { result, rerender } = renderHook(
      ({ source }: { source: BehaviorSubject<number> }) =>
        useLatestState(source),
      { initialProps: { source: a } },
    );

    rerender({ source: b });

    act(() => b.next(20));
    expect(result.current).toEqual(20);

    act(() => a.next(2));
    expect(result.current).toEqual(20);
  });
});
