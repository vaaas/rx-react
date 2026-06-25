# @vaaas/rx-react

An rxjs application-architecture kit for React: CQRS read/write buses, a
reactive store with persistence and devtools, and the React glue that binds it
all together — tearing-safely.

The library is shipped as independent subpath exports, so you take only what you
need:

| Import | What it is |
| --- | --- |
| `@vaaas/rx-react/event-bus` | Write side — dispatch typed events, handle them with rxjs operators |
| `@vaaas/rx-react/query-bus` | Read side — resolve typed queries to reactive store slices |
| `@vaaas/rx-react/store` | `BehaviorSubject`-backed store with shallow-merge writes and selectors |
| `@vaaas/rx-react/persist` | Pluggable storage persistence (localStorage, sessionStorage, Cache API) |
| `@vaaas/rx-react/pipeline` | Railway-oriented `Result` pipeline for authoring event-bus handlers |
| `@vaaas/rx-react/devtools` | Redux DevTools taps for stores and the event bus |
| `@vaaas/rx-react/hooks` | Low-level rxjs ↔ React hooks |

The buses are the two ports a component talks to: `useEventBus()` to write,
`useQuery()` to read. Stores sit behind those ports — components don't import
them directly.

---

## event-bus

A centralised event bus for event sourcing in large React applications,
decoupling event firing and handling from your store. Your store stays
dedicated to state; handlers issue side-effects (mainly network requests).

Given an event:

```javascript
class MyEvent {
  constructor(payload) {
    this.payload = payload;
  }
}
```

Register the event and a handler:

```javascript
const eventBus = new EventBus();
eventBus.on(
  MyEvent,
  pipe(
    // any rxjs operator, e.g. throttle, debounce...
    map(({ event, dispatch }) => {
      console.log(event.payload);
    }),
  ),
);

return (
  <EventBusContext.Provider value={eventBus}>
    <MyApp />
  </EventBusContext.Provider>
);
```

Then, in any React component:

```javascript
function MyComponent() {
  const eventBus = useEventBus();
  function onClick() {
    eventBus.dispatch(new MyEvent("hello, world!"));
  }
  return <button onClick={onClick}>Click me</button>;
}
```

If you have several related event handlers, you can register them in batches
through installers:

```typescript
function MyInstaller(eventBus: IEventBus): IEventBus {
  return eventBus
    .on(SomeEvent, someHandler)
    .on(AnotherEvent, anotherHandler)
    .on(ThirdEvent, tertiaryHandler);
}

const eventBus = new EventBus().install(MyInstaller);
```

Handlers can be registered dynamically and asynchronously as needed. If you have
a lot of handlers, you don't need to register all of them upfront, and separate
modules can plug their own handlers and events into the central event bus after
loading.

The bus also exposes its dispatch stream as a read-only `events$` observable —
handy for logging, debugging, or feeding the [devtools](#devtools) tap.

The idiomatic way to author a non-trivial handler is the
[`ResultPipeline`](#pipeline), whose terminal `.catch()` returns exactly the
`Handler` shape `.on()` expects.

## store

A thin reactive store over a `BehaviorSubject`, restoring the ergonomics a raw
subject lacks: shallow-merge updates, a synchronous read, and a derivation both
the imperative and reactive paths can share. Pure rxjs — construct it once at
app wiring and inject it where state is owned.

```typescript
import { createStore } from "@vaaas/rx-react/store";

const counter = createStore({ count: 0, name: "untitled" });

counter.get(); // { count: 0, name: "untitled" } — synchronous read

counter.set({ count: 1 }); // shallow-merge then emit
counter.set((s) => ({ count: s.count + 1 })); // function form
counter.update((s) => ({ ...s, name: "renamed" })); // full replace

const count$ = counter.select((s) => s.count); // Observable<number>, distinct
```

Typically only event-bus handlers call `set`/`update` — that keeps writes in one
place.

### useStoreSelector

Reads a slice of an externally-owned store as React state. Built on
`useSyncExternalStore`, so it is **tearing-safe under concurrent React**,
synchronously seeded (no placeholder flash), and re-renders only when the
selected slice changes.

```typescript
import { useStoreSelector, shallow } from "@vaaas/rx-react/store";

function Count() {
  const count = useStoreSelector(counter.value$, (s) => s.count);
  return <span>{count}</span>;
}

// For object/array slices, pass `shallow` to avoid re-rendering on every emission.
function Totals() {
  const totals = useStoreSelector(
    counter.value$,
    (s) => ({ count: s.count, name: s.name }),
    shallow,
  );
  return <span>{totals.name}: {totals.count}</span>;
}
```

### shallow

One-level structural equality over objects and arrays — the comparator to pass
to `useStoreSelector` (or `select`) when selecting a non-primitive slice.

```typescript
shallow({ a: 1, b: 2 }, { a: 1, b: 2 }); // true
shallow([1, 2], [1, 2]); // true
shallow({ a: { x: 1 } }, { a: { x: 1 } }); // false — nested compared by reference
```

## query-bus

The read-side counterpart to the event bus: a typed router where a `Query<R>`
class resolves to a handler producing a `BehaviorSubject`-backed observable.
Components ask "what view do I need?" instead of "which slices of which stores do
I read?" — and never import a store directly.

A handler is one line of rxjs over a store; `store.select(...)` is the handler
factory:

```typescript
import { Query, QueryBus, QueryBusContext, useQuery } from "@vaaas/rx-react/query-bus";
import { createStore } from "@vaaas/rx-react/store";

const wallet = createStore({
  chain: "ethereum",
  balances: {} as Record<string, bigint>,
});

class GetChain extends Query<string> {}
class GetVaultBalance extends Query<bigint> {
  constructor(public readonly key: string) { super(); }
}

const bus = new QueryBus()
  .register(GetChain, () => wallet.select((s) => s.chain))
  .register(GetVaultBalance, (q) => wallet.select((s) => s.balances[q.key]));
```

Provide the bus and read from it:

```typescript
return (
  <QueryBusContext.Provider value={bus}>
    <MyApp />
  </QueryBusContext.Provider>
);

function ChainBadge() {
  const chain = useQuery(new GetChain()); // tearing-safe, reactive
  return <span>{chain}</span>;
}
```

`useQuery` memoises by query value, so allocating a fresh `new GetX(args)` every
render reuses one subscription — query identity carries no re-render penalty.
For non-React callers, `bus.snapshot(new GetChain())` reads the current value
synchronously.

## persist

Persists a [store](#store) to a swappable storage backend: hydrate on creation
(running `migrate` on a version mismatch, then shallow-merging over the seed),
then write `partialize(state)` back on every change. Returns the same store, so
it composes.

```typescript
import { createStore } from "@vaaas/rx-react/store";
import { persist, sessionStorageDriver } from "@vaaas/rx-react/persist";

const settings = persist(createStore({ theme: "light", sidebar: true }), {
  key: "settings",
  version: 2,
  storage: sessionStorageDriver, // default: localStorageDriver
  partialize: (s) => ({ theme: s.theme }), // persist a subset
  migrate: (persisted, version) => ({ ...defaults, ...(persisted as object) }),
});
```

Synchronous backends (localStorage, sessionStorage) hydrate before `persist`
returns — no flash. Asynchronous backends surface hydration status:

```typescript
import { persist, cacheStorageDriver } from "@vaaas/rx-react/persist";

const cached = persist(createStore(initial), {
  key: "app-state",
  storage: cacheStorageDriver("app"), // browser Cache API — async
});

await cached.hydrated; // resolves when hydration completes
cached.hasHydrated(); // boolean
```

### Storage drivers

Every backend implements one small interface, so you can plug in your own:

```typescript
interface StorageDriver {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

Built in: `localStorageDriver`, `sessionStorageDriver`,
`cacheStorageDriver(name)`, and `webStorageDriver(() => anyDomStorage)`. Storage
and parse errors are routed to an `onError` callback rather than thrown.

## pipeline

`ResultPipeline` is a railway-oriented wrapper over rxjs operators: a thrown
exception or rejected promise becomes an in-band error value that short-circuits
the remaining steps and surfaces at a single terminal `.catch()`. Its terminal
returns exactly the event bus's `Handler` shape, so a pipeline *is* a handler.

```typescript
import { ResultPipeline } from "@vaaas/rx-react/pipeline";
import type { EventParameter } from "@vaaas/rx-react/event-bus";

eventBus.on(
  SaveUser,
  ResultPipeline.start<EventParameter<SaveUser>>()
    .map(({ event }) => event.user)
    .filter((user) => user.id !== null)
    .concatMap((user) => api.save(user)) // thrown/rejected → in-band error
    .tap((saved) => console.log("saved", saved.id))
    .recover(() => fallbackUser) // optionally turn an error back into a value
    .catch((error) => reportError(error)), // terminal: a bus Handler
);
```

Surface: `map`, `filter` (with type-guard narrowing), `tap`, `filterMap`
(null/undefined drops the item), `concatMap`, `delay`, `recover`, and `catch`.

## devtools

Taps state and events to the Redux DevTools browser extension, giving raw
subjects the timeline and inspector that zustand's devtools middleware provides.
Both no-op when there is no `window` or the extension is absent (SSR,
production), and return their argument so they compose.

```typescript
import { devtools, devtoolsEventBus } from "@vaaas/rx-react/devtools";

// State timeline — each store emission is an entry.
const wallet = devtools(createStore(initial), "wallet-state");

// Action timeline — each dispatched event becomes an action typed by its class.
devtoolsEventBus(eventBus, "wallet-events");
```

Pair the two under different names for a state monitor alongside an action
monitor — the read/write split of CQRS, reflected in DevTools.

## hooks

Low-level hooks for bridging rxjs observables into the React lifecycle.

### useConstant

Returns a value that is constant for the lifetime of the component. The factory
runs once on mount; later renders return the same value. Unlike `useMemo` —
which React may discard and recompute as a memory-saving heuristic — the
returned reference is guaranteed stable.

```typescript
const observer = useConstant(() => new IntersectionObserver(onIntersect));
```

Used internally by the other hooks in this module, and exported because the
pattern is generally useful for per-component singletons (subjects, observables,
class instances, anything else where reference stability matters).

### useSubject

Creates a stable Subject and a callback to push values into it. Use for event
firehoses where "current value" is not meaningful.

```typescript
function SearchBox() {
  const [input$, onInput] = useSubject<string>();
  return <input onChange={(e) => onInput(e.target.value)} />;
}
```

For component-local reactive state with a current value and replay semantics,
prefer `useBehaviorSubject`.

### useBehaviorSubject

Creates a stable `BehaviorSubject` seeded with an initial value or a lazy
initializer. Late subscribers receive the latest value; callers can push via
`.next(x)` and read synchronously via `.value`.

```typescript
function Counter() {
  const count$ = useBehaviorSubject(0);
  const count = useLatestState(count$);
  return (
    <button onClick={() => count$.next(count$.value + 1)}>
      {count}
    </button>
  );
}
```

Use the function form for expensive initials — it runs once on mount.

```typescript
const cache$ = useBehaviorSubject(() => buildExpensiveInitialCache());
```

### useEffectStream

Bridges React dependencies into an observable. Variadic: pass one argument to
emit scalars, pass several to emit a tuple. Backed by a `BehaviorSubject` so
subscribers attached after mount still receive the latest value.

```typescript
function UserProfile({ userId }: { userId: string }) {
  const userId$ = useEffectStream(userId); // BehaviorSubject<string>
}

function Multi({ a, b }: { a: number; b: string }) {
  const deps$ = useEffectStream(a, b); // BehaviorSubject<[number, string]>
}
```

### useObservable

Builds an observable from a factory once and returns a stable reference. Covers
both single-source pipelines and multi-source derivations.

```typescript
const debounced$ = useObservable(() => input$.pipe(debounceTime(300)));

const total$ = useObservable(() =>
  combineLatest([a$, b$, c$]).pipe(
    map(([a, b, c]) => a * b * c),
    distinctUntilChanged(),
  ),
);
```

The factory runs once per component instance — by design, there is no dep array.
If you need re-derivation, drive it through a stream input.

### useSubscription

Subscribes to an observable for the lifetime of the component, unsubscribing on
unmount and re-subscribing only when `source` changes. The observer is captured
by ref, so inline closures are safe — the latest closure is always invoked
without triggering a resubscribe.

```typescript
function ClickLogger({ clicks$, label }: Props) {
  useSubscription(clicks$, (event) => {
    // `label` is always the latest prop value, no resubscribe per render
    console.log(label, event);
  });
}
```

### useLatestState

Turns an observable into tearing-safe React state, built on
`useSyncExternalStore`. The seed is the source's own current value whenever it
has one, so no placeholder flash:

- a `BehaviorSubject` is read from `source.value`;
- any other **behavior** observable (one that emits synchronously on
  subscription, such as a `store.select(...)` derivation) is read from its first
  emission;
- pass `initial` only for a source that does **not** emit synchronously (a cold
  or event-driven `Observable`).

```typescript
function Counter({ count$ }: { count$: BehaviorSubject<number> }) {
  const count = useLatestState(count$); // seeded from count$.value
  return <span>{count}</span>;
}

function Total({ store }: { store: Store<S> }) {
  // store.select(...) emits synchronously — no initial needed
  const total = useLatestState(store.select((s) => s.total));
  return <span>{total}</span>;
}

function Cold({ ticks$ }: { ticks$: Observable<number> }) {
  const tick = useLatestState(ticks$, 0); // cold source — seed with initial
  return <span>{tick}</span>;
}
```
