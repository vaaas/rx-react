import { describe, it, expect, vi, afterEach } from "vitest";
import { map, pipe } from "rxjs";
import { EventBus, Handler } from "../src/event-bus.js";

class TestEvent {
  constructor(public value: number) {}
}

const OldConsole = Object.freeze({
  warn: console.warn,
});

describe("EventBus", () => {
  afterEach(() => {
    console.warn = OldConsole.warn;
  });

  it("runs the handler when its event is dispatched", () => {
    const handler = vi.fn();
    const bus = new EventBus();

    const testHandler: Handler<typeof TestEvent> = pipe(
      map(({ event }) => {
        handler(event.value);
        return undefined;
      }),
    );

    bus.on(TestEvent, testHandler).start().dispatch(new TestEvent(42));

    expect(handler).toHaveBeenCalledWith(42);
  });

  it("warns when there is no associated event handler", () => {
    console.warn = vi.fn();
    new EventBus().start().dispatch(new TestEvent(42));
    expect(console.warn).toHaveBeenCalledWith(
      "Unhandled event:",
      TestEvent.name,
    );
  });
});
