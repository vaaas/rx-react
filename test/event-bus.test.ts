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

  it("stops processing events when stopped, and resumes when restarted", () => {
    const handler = vi.fn();
    const bus = new EventBus();

    const testHandler: Handler<typeof TestEvent> = pipe(
      map(({ event }) => {
        handler(event.value);
        return undefined;
      }),
    );

    bus.on(TestEvent, testHandler).start().dispatch(new TestEvent(1));
    expect(handler).toHaveBeenCalledTimes(1);

    bus.stop();
    bus.dispatch(new TestEvent(2));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalledWith(2);

    bus.start().dispatch(new TestEvent(3));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(3);
  });
});
