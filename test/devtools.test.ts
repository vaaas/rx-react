import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/event-bus.js";
import {
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
