import { describe, it, expect, vi } from "vitest";
import { map, pipe } from "rxjs";
import { EventBus, Handler } from "../src/event-bus.js";

class TestEvent {
  constructor(public value: number) {}
}

describe("EventBus", () => {
  it("runs the handler when its event is dispatched", () => {
    const handler = vi.fn();
    const bus = new EventBus();

    const testHandler: Handler<typeof TestEvent> = pipe(
      map(({ event }) => handler(event.value)),
    );

    bus.on(TestEvent, testHandler).start().dispatch(new TestEvent(42));

    expect(handler).toHaveBeenCalledWith(42);
  });
});
