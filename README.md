# @vaaas/rx-react

An rxjs event-sourcing kit for React: an event bus for dispatching and handling
typed events, a railway-oriented pipeline for authoring its handlers, and the
React glue that binds it all together — tearing-safely.

The library is shipped as independent subpath exports, so you take only what you
need:

| Import | What it is |
| --- | --- |
| `@vaaas/rx-react/event-bus` | Dispatch typed events, handle them with rxjs operators |
| `@vaaas/rx-react/pipeline` | Railway-oriented `Result` pipeline for authoring event-bus handlers |
| `@vaaas/rx-react/devtools` | Redux DevTools tap for the event bus |
| `@vaaas/rx-react/hooks` | Low-level rxjs ↔ React hooks |

---

## event-bus

A centralised event bus for event sourcing in large React applications,
decoupling event firing and handling from your state layer. Your state stays
dedicated to what the UI reads; handlers issue side-effects (mainly network
requests).

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

Taps the event bus's dispatched events to the Redux DevTools browser extension
as an action timeline: each event becomes an action typed by its class name,
carrying the event instance as payload. No-ops when there is no `window` or the
extension is absent (SSR, production), and returns the bus so it composes.

```typescript
import { devtoolsEventBus } from "@vaaas/rx-react/devtools";

// Action timeline — each dispatched event becomes an action typed by its class.
devtoolsEventBus(eventBus, "wallet-events");
```

The tap observes the raw dispatch stream, so it records every dispatched event
regardless of whether the bus is started or a handler is registered.

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
  subscription, such as one ending in `startWith(...)` or a
  `distinctUntilChanged` over a `BehaviorSubject`) is read from its first
  emission;
- pass `initial` only for a source that does **not** emit synchronously (a cold
  or event-driven `Observable`).

```typescript
function Counter({ count$ }: { count$: BehaviorSubject<number> }) {
  const count = useLatestState(count$); // seeded from count$.value
  return <span>{count}</span>;
}

function Total({ amount$ }: { amount$: BehaviorSubject<number> }) {
  // a distinct derivation over a BehaviorSubject emits synchronously — no initial
  const total = useLatestState(amount$.pipe(distinctUntilChanged()));
  return <span>{total}</span>;
}

function Cold({ ticks$ }: { ticks$: Observable<number> }) {
  const tick = useLatestState(ticks$, 0); // cold source — seed with initial
  return <span>{tick}</span>;
}
```
