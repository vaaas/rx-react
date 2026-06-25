import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { Subject, of } from "rxjs";
import { createStore } from "../src/store.js";
import {
  Query,
  QueryBus,
  QueryBusContext,
  useQuery,
  type IQueryBus,
} from "../src/query-bus.js";

class GetCount extends Query<number> {}
class GetDoubled extends Query<number> {}
class GetItem extends Query<string> {
  constructor(public readonly id: number) {
    super();
  }
}
class Unregistered extends Query<unknown> {}

function counterBus() {
  const store = createStore({
    count: 0,
    items: { 1: "a", 2: "b" } as Record<number, string>,
  });
  const bus = new QueryBus()
    .register(GetCount, () => store.select((s) => s.count))
    .register(GetDoubled, () => store.select((s) => s.count * 2))
    .register(GetItem, (q) => store.select((s) => s.items[q.id]));
  return { store, bus };
}

describe("QueryBus", () => {
  it("snapshots a query's current value synchronously", () => {
    const { store, bus } = counterBus();

    expect(bus.snapshot(new GetCount())).toBe(0);
    store.set({ count: 3 });
    expect(bus.snapshot(new GetCount())).toBe(3);
    expect(bus.snapshot(new GetDoubled())).toBe(6);
  });

  it("passes query parameters to the handler", () => {
    const { bus } = counterBus();

    expect(bus.snapshot(new GetItem(1))).toBe("a");
    expect(bus.snapshot(new GetItem(2))).toBe("b");
  });

  it("exposes the underlying observable via query()", () => {
    const { store, bus } = counterBus();
    const seen: number[] = [];
    bus.query(new GetCount()).subscribe((n) => seen.push(n));

    store.set({ count: 1 });
    store.set({ count: 1 });
    store.set({ count: 2 });

    expect(seen).toEqual([0, 1, 2]);
  });

  it("throws for an unregistered query", () => {
    const bus = new QueryBus();

    expect(() => bus.snapshot(new Unregistered())).toThrow(/no handler/i);
  });

  it("applies an installer", () => {
    const bus = new QueryBus().install((b: IQueryBus) =>
      b.register(GetCount, () => of(42)),
    );

    expect(bus.snapshot(new GetCount())).toBe(42);
  });

  it("snapshot throws when the handler observable does not emit synchronously", () => {
    const bus = new QueryBus().register(GetCount, () => new Subject<number>());

    expect(() => bus.snapshot(new GetCount())).toThrow(/synchronous/i);
  });
});

describe("useQuery", () => {
  const wrap =
    (bus: IQueryBus) =>
    ({ children }: { children: ReactNode }) =>
      createElement(QueryBusContext.Provider, { value: bus }, children);

  it("returns the current value synchronously on first render", () => {
    const { store, bus } = counterBus();
    store.set({ count: 5 });

    const { result } = renderHook(() => useQuery(new GetCount()), {
      wrapper: wrap(bus),
    });

    expect(result.current).toBe(5);
  });

  it("re-renders when the underlying store slice changes", () => {
    const { store, bus } = counterBus();
    const { result } = renderHook(() => useQuery(new GetCount()), {
      wrapper: wrap(bus),
    });

    expect(result.current).toBe(0);
    act(() => store.set({ count: 1 }));
    expect(result.current).toBe(1);
    act(() => store.set({ count: 2 }));
    expect(result.current).toBe(2);
  });

  it("does not re-render when an unselected slice changes", () => {
    const { store, bus } = counterBus();
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders++;
        return useQuery(new GetItem(1));
      },
      { wrapper: wrap(bus) },
    );

    expect(result.current).toBe("a");
    const rendersAfterMount = renders;

    act(() => store.set({ count: 99 }));

    expect(renders).toBe(rendersAfterMount);
    expect(result.current).toBe("a");
  });

  it("re-derives when query parameters change", () => {
    const { bus } = counterBus();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useQuery(new GetItem(id)),
      { wrapper: wrap(bus), initialProps: { id: 1 } },
    );

    expect(result.current).toBe("a");
    rerender({ id: 2 });
    expect(result.current).toBe("b");
  });
});
