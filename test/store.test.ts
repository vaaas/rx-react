import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { createStore, shallow, useStoreSelector } from "../src/store.js";

describe("shallow", () => {
  it("returns true for identical references", () => {
    const obj = { a: 1 };
    expect(shallow(obj, obj)).toBe(true);
  });

  it("compares primitives by Object.is", () => {
    expect(shallow(1, 1)).toBe(true);
    expect(shallow("a", "b")).toBe(false);
    expect(shallow(Number.NaN, Number.NaN)).toBe(true);
  });

  it("returns true for shallow-equal objects", () => {
    expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("returns false when a value differs", () => {
    expect(shallow({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("returns false when key counts differ", () => {
    expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares only one level deep", () => {
    const nested = { x: 1 };
    expect(shallow({ a: nested }, { a: nested })).toBe(true);
    expect(shallow({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
  });

  it("handles arrays", () => {
    expect(shallow([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallow([1, 2], [1, 2, 3])).toBe(false);
    expect(shallow([1, 2, 3], [1, 9, 3])).toBe(false);
  });

  it("returns false when only one side is null", () => {
    expect(shallow({ a: 1 }, null as unknown as { a: number })).toBe(false);
    expect(shallow(null as unknown as { a: number }, { a: 1 })).toBe(false);
  });
});

describe("useStoreSelector", () => {
  it("returns the selected slice synchronously on first render", () => {
    const store$ = new BehaviorSubject({ count: 5, name: "a" });
    const { result } = renderHook(() =>
      useStoreSelector(store$, (s) => s.count),
    );

    expect(result.current).toEqual(5);
  });

  it("re-renders when the selected slice changes", () => {
    const store$ = new BehaviorSubject({ count: 0, name: "a" });
    const { result } = renderHook(() =>
      useStoreSelector(store$, (s) => s.count),
    );

    act(() => store$.next({ count: 1, name: "a" }));

    expect(result.current).toEqual(1);
  });

  it("does not re-render when an unselected slice changes", () => {
    const store$ = new BehaviorSubject({ count: 0, name: "a" });
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useStoreSelector(store$, (s) => s.count);
    });
    const initialRenders = renders;

    act(() => store$.next({ count: 0, name: "b" }));

    expect(result.current).toEqual(0);
    expect(renders).toEqual(initialRenders);
  });

  it("avoids re-render on structurally-equal object slices via shallow", () => {
    const store$ = new BehaviorSubject({ a: 1, b: 2, other: 0 });
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useStoreSelector(store$, (s) => ({ a: s.a, b: s.b }), shallow);
    });
    const initialRenders = renders;
    const firstResult = result.current;

    act(() => store$.next({ a: 1, b: 2, other: 99 }));

    expect(renders).toEqual(initialRenders);
    expect(result.current).toBe(firstResult);
  });

  it("re-renders when a shallow-selected slice actually changes", () => {
    const store$ = new BehaviorSubject({ a: 1, b: 2 });
    const { result } = renderHook(() =>
      useStoreSelector(store$, (s) => ({ a: s.a, b: s.b }), shallow),
    );

    act(() => store$.next({ a: 1, b: 3 }));

    expect(result.current).toEqual({ a: 1, b: 3 });
  });

  it("re-subscribes and re-reads when the source is swapped", () => {
    const a$ = new BehaviorSubject({ count: 1 });
    const b$ = new BehaviorSubject({ count: 10 });

    const { result, rerender } = renderHook(
      ({ source }: { source: BehaviorSubject<{ count: number }> }) =>
        useStoreSelector(source, (s) => s.count),
      { initialProps: { source: a$ } },
    );

    expect(result.current).toEqual(1);

    rerender({ source: b$ });
    expect(result.current).toEqual(10);

    act(() => b$.next({ count: 20 }));
    expect(result.current).toEqual(20);

    act(() => a$.next({ count: 2 }));
    expect(result.current).toEqual(20);
  });
});

describe("createStore", () => {
  it("seeds value$ and get() with the initial state", () => {
    const store = createStore({ count: 0, name: "a" });

    expect(store.value$).toBeInstanceOf(BehaviorSubject);
    expect(store.get()).toEqual({ count: 0, name: "a" });
    expect(store.value$.value).toEqual({ count: 0, name: "a" });
  });

  it("shallow-merges a partial and emits", () => {
    const store = createStore({ count: 0, name: "a" });
    const emissions: { count: number; name: string }[] = [];
    store.value$.subscribe((s) => emissions.push(s));

    store.set({ count: 5 });

    expect(store.get()).toEqual({ count: 5, name: "a" });
    expect(emissions).toEqual([
      { count: 0, name: "a" },
      { count: 5, name: "a" },
    ]);
  });

  it("accepts a function of the current state in set", () => {
    const store = createStore({ count: 1, name: "a" });

    store.set((s) => ({ count: s.count + 1 }));

    expect(store.get()).toEqual({ count: 2, name: "a" });
  });

  it("replaces the whole state with update", () => {
    const store = createStore({ count: 1, name: "a" });

    store.update((s) => ({ count: s.count + 10, name: "b" }));

    expect(store.get()).toEqual({ count: 11, name: "b" });
  });

  it("derives a slice via select, suppressing consecutive duplicates", () => {
    const store = createStore({ count: 0, name: "a" });
    const counts: number[] = [];
    store.select((s) => s.count).subscribe((c) => counts.push(c));

    store.set({ name: "b" });
    store.set({ count: 1 });
    store.set({ count: 1 });

    expect(counts).toEqual([0, 1]);
  });

  it("uses a custom equality comparator in select", () => {
    const store = createStore({ a: 1, b: 2, other: 0 });
    const slices: { a: number; b: number }[] = [];
    store
      .select((s) => ({ a: s.a, b: s.b }), shallow)
      .subscribe((x) => slices.push(x));

    store.set({ other: 99 });

    expect(slices).toEqual([{ a: 1, b: 2 }]);
  });

  it("feeds useStoreSelector for tearing-safe React reads", () => {
    const store = createStore({ count: 0, name: "a" });
    const { result } = renderHook(() =>
      useStoreSelector(store.value$, (s) => s.count),
    );

    expect(result.current).toEqual(0);

    act(() => store.set({ count: 3 }));

    expect(result.current).toEqual(3);
  });
});
