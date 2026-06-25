import { skip } from "rxjs";
import { IEventBus } from "./event-bus.js";
import { Store } from "./store.js";

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
  /** Action label sent on each state change. Default `"update"`. */
  action?: string;
}

function reduxExtension(): DevtoolsExtension | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension })
    .__REDUX_DEVTOOLS_EXTENSION__;
}

/**
 * Taps a store's state emissions to the Redux DevTools extension, giving a raw
 * `BehaviorSubject`-backed store the state timeline and inspector that zustand's
 * devtools middleware provides.
 *
 * No-ops when there is no `window` or the extension is absent (SSR, production,
 * tests), returning the store untouched so it stays chainable:
 * `devtools(persist(createStore(initial), { key }), "wallet")`.
 *
 * Every entry carries a single generic `action` label, because a store sees
 * state, not the cause of a change. Naming actions is the event bus's job,
 * where each dispatched event already carries its own type.
 */
export function devtools<S>(
  store: Store<S>,
  name: string,
  options: DevtoolsOptions = {},
): Store<S> {
  const extension = options.extension ?? reduxExtension();
  if (!extension) return store;

  const action = options.action ?? "update";
  const connection = extension.connect({ name });
  connection.init(store.get());
  store.value$
    .pipe(skip(1))
    .subscribe((state) => connection.send({ type: action }, state));

  return store;
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
 * event instance as payload. This is the action timeline the store tap cannot
 * produce on its own — pair the two under different names for an action monitor
 * alongside a state monitor.
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
