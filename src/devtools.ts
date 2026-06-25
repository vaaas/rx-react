import { skip } from "rxjs";
import { Store } from "./store.js";

interface DevtoolsConnection {
  init(state: unknown): void;
  send(action: { type: string }, state: unknown): void;
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
