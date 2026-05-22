# rxjs utilities for react

## event-bus

Provides a centralised event bus for react applications. The intended use case is to support event sourcing in large react applications, decoupling event firing and handling from your store. That way, your store can be dedicated to mutations, while the event bus handlers can issue side-effects (mainly network requests).

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
  <EventBusProvider value={eventBus}>
    <MyApp />
  </EventBusProvider>
);
```

Then, in any react component:

```javascript
function MyComponent() {
  const eventBus = useEventBus();
  function onClick() {
    eventBus.dispatch(new MyEvent("hello, world!"));
  }
  return <button onClick={onClick}>Click me</button>;
}
```

If you have several related event handlers, you can register them in batches through installers:

```typescript
function MyInstaller(eventBus: IEventBus): IEventBus {
  return eventBus
    .on(SomeEvent, someHandler)
    .on(AnotherEvent, anotherHandler)
    .on(ThirdEvent, tertiaryHandler);
}

const eventBus = new EventBus().install(MyInstaller);
```

Handlers can be registered dynamically and asynchronously as needed. If you have a lot of handlers, you don't need to register all of them upfront, and separate modules can plug their own handlers and events into the central event bus after loading.

## hooks

React hooks for bridging rxjs observables into the React lifecycle.

### useConstant

Returns a value that is constant for the lifetime of the component. The factory runs once on mount; later renders return the same value. Unlike `useMemo` — which React may discard and recompute as a memory-saving heuristic — the returned reference is guaranteed stable.

```typescript
const observer = useConstant(() => new IntersectionObserver(onIntersect));
```

Used internally by the other hooks in this module, and exported because the pattern is generally useful for per-component singletons (subjects, observables, class instances, anything else where reference stability matters).

### useSubject

Creates a stable Subject and a callback to push values into it. Use for event firehoses where "current value" is not meaningful.

```typescript
function SearchBox() {
  const [input$, onInput] = useSubject<string>();
  return <input onChange={(e) => onInput(e.target.value)} />;
}
```

For component-local reactive state with a current value and replay semantics, prefer `useBehaviorSubject`.

### useBehaviorSubject

Creates a stable `BehaviorSubject` seeded with an initial value or a lazy initializer. Late subscribers receive the latest value; callers can push via `.next(x)` and read synchronously via `.value`.

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

Bridges React dependencies into an observable. Variadic: pass one argument to emit scalars, pass several to emit a tuple. Backed by a `BehaviorSubject` so subscribers attached after mount still receive the latest value.

```typescript
function UserProfile({ userId }: { userId: string }) {
  const userId$ = useEffectStream(userId); // BehaviorSubject<string>
}

function Multi({ a, b }: { a: number; b: string }) {
  const deps$ = useEffectStream(a, b); // BehaviorSubject<[number, string]>
}
```

### useObservable

Builds an observable from a factory once and returns a stable reference. Covers both single-source pipelines and multi-source derivations.

```typescript
const debounced$ = useObservable(() => input$.pipe(debounceTime(300)));

const total$ = useObservable(() =>
  combineLatest([a$, b$, c$]).pipe(
    map(([a, b, c]) => a * b * c),
    distinctUntilChanged(),
  ),
);
```

The factory runs once per component instance — by design, there is no dep array. If you need re-derivation, drive it through a stream input.

### useSubscription

Subscribes to an observable for the lifetime of the component, unsubscribing on unmount and re-subscribing only when `source` changes. The observer is captured by ref, so inline closures are safe — the latest closure is always invoked without triggering a resubscribe.

```typescript
function ClickLogger({ clicks$, label }: Props) {
  useSubscription(clicks$, (event) => {
    // `label` is always the latest prop value, no resubscribe per render
    console.log(label, event);
  });
}
```

### useLatestState

Turns an observable into React state. When the source is a `BehaviorSubject`, the initial value is read from `source.value` — no initial argument and no flash of a placeholder. For plain observables, an explicit initial is required.

```typescript
function Counter({ count$ }: { count$: BehaviorSubject<number> }) {
  const count = useLatestState(count$); // seeded from count$.value
  return <span>{count}</span>;
}

function Cold({ ticks$ }: { ticks$: Observable<number> }) {
  const tick = useLatestState(ticks$, 0); // explicit initial required
  return <span>{tick}</span>;
}
```
