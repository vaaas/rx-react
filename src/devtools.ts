import { IEventBus } from "./event-bus.js";

interface DevtoolsConnection {
  init(state: unknown): void;
  send(action: { type: string; payload?: unknown }, state: unknown): void;
}

export interface DevtoolsExtension {
  connect(options: { name: string }): DevtoolsConnection;
}

export interface DevtoolsOptions {
  /**
   * The extension to connect to. Defaults to the Redux DevTools browser global;
   * injectable so it can be faked in tests.
   */
  extension?: DevtoolsExtension;
}

function reduxExtension(): DevtoolsExtension | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension })
    .__REDUX_DEVTOOLS_EXTENSION__;
}

function eventType(event: unknown): string {
  return (
    (event as { constructor?: { name?: string } } | null)?.constructor?.name ??
    "anonymous"
  );
}

/**
 * Taps an event bus's dispatched events to the Redux DevTools extension as named
 * actions: each event becomes an action typed by its class name, carrying the
 * event instance as payload.
 *
 * No-ops without a `window`/extension, returning the bus untouched so it stays
 * chainable. The tap observes the raw dispatch stream, so it records every
 * dispatched event regardless of whether the bus is started or a handler is
 * registered.
 */
export function devtoolsEventBus(
  bus: IEventBus,
  name: string,
  options: DevtoolsOptions = {},
): IEventBus {
  const extension = options.extension ?? reduxExtension();
  if (!extension) return bus;

  const connection = extension.connect({ name });
  connection.init({});
  bus.events$.subscribe((event) =>
    connection.send({ type: eventType(event), payload: event }, {}),
  );

  return bus;
}
