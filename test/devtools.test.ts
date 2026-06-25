import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/store.js";
import { devtools, type DevtoolsExtension } from "../src/devtools.js";

function fakeExtension() {
  const init = vi.fn();
  const send = vi.fn();
  const connect = vi.fn((_options: { name: string }) => ({ init, send }));
  const extension: DevtoolsExtension = { connect };
  return { extension, connect, init, send };
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
