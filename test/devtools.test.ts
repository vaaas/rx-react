import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/store.js";
import { EventBus } from "../src/event-bus.js";
import {
  devtools,
  devtoolsEventBus,
  type DevtoolsExtension,
} from "../src/devtools.js";

function fakeExtension() {
  const init = vi.fn();
  const send = vi.fn();
  const connect = vi.fn((_options: { name: string }) => ({ init, send }));
  const extension: DevtoolsExtension = { connect };
  return { extension, connect, init, send };
}

class Deposit {
  constructor(public amount: number) {}
}

class Withdraw {
  constructor(public amount: number) {}
}

describe("devtools", () => {
  it("connects with the given name and seeds the initial state", () => {
    const { extension, connect, init } = fakeExtension();

    devtools(createStore({ count: 0 }), "wallet", { extension });

    expect(connect).toHaveBeenCalledWith({ name: "wallet" });
    expect(init).toHaveBeenCalledWith({ count: 0 });
  });

  it("sends each change as an action, skipping the initial replay", () => {
    const { extension, send } = fakeExtension();
    const store = devtools(createStore({ count: 0 }), "wallet", { extension });

    expect(send).not.toHaveBeenCalled();

    store.set({ count: 1 });
    store.set({ count: 2 });

    expect(send.mock.calls).toEqual([
      [{ type: "update" }, { count: 1 }],
      [{ type: "update" }, { count: 2 }],
    ]);
  });

  it("uses a custom action label", () => {
    const { extension, send } = fakeExtension();
    const store = devtools(createStore({ count: 0 }), "wallet", {
      extension,
      action: "set",
    });

    store.set({ count: 1 });

    expect(send).toHaveBeenCalledWith({ type: "set" }, { count: 1 });
  });

  it("returns the same store for chaining", () => {
    const { extension } = fakeExtension();
    const store = createStore({ count: 0 });

    expect(devtools(store, "wallet", { extension })).toBe(store);
  });

  it("no-ops and stays usable when no extension is available", () => {
    const store = createStore({ count: 0 });

    const result = devtools(store, "wallet");

    expect(result).toBe(store);
    expect(() => result.set({ count: 1 })).not.toThrow();
    expect(result.get()).toEqual({ count: 1 });
  });
});

describe("devtoolsEventBus", () => {
  it("connects with the given name and seeds empty state", () => {
    const { extension, connect, init } = fakeExtension();

    devtoolsEventBus(new EventBus(), "bus", { extension });

    expect(connect).toHaveBeenCalledWith({ name: "bus" });
    expect(init).toHaveBeenCalledWith({});
  });

  it("sends each dispatched event as an action carrying the event payload", () => {
    const { extension, send } = fakeExtension();
    const bus = devtoolsEventBus(new EventBus(), "bus", { extension });

    const event = new Deposit(100);
    bus.dispatch(event);

    expect(send).toHaveBeenCalledWith(
      { type: "Deposit", payload: event },
      {},
    );
  });

  it("labels each action with the event's class name", () => {
    const { extension, send } = fakeExtension();
    const bus = devtoolsEventBus(new EventBus(), "bus", { extension });

    bus.dispatch(new Deposit(1));
    bus.dispatch(new Withdraw(2));

    expect(send.mock.calls.map((call) => call[0].type)).toEqual([
      "Deposit",
      "Withdraw",
    ]);
  });

  it("returns the same bus and no-ops without an extension", () => {
    const bus = new EventBus();

    const result = devtoolsEventBus(bus, "bus");

    expect(result).toBe(bus);
    expect(() => result.dispatch(new Deposit(1))).not.toThrow();
  });
});
