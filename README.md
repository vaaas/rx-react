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

### useSubject

Creates a stable Subject and a callback to push values into it. Useful for turning event handlers into observable sources.

```typescript
function SearchBox() {
  const [input$, onInput] = useSubject<string>();
  // input$ is an Observable<string> you can pipe further
  return <input onChange={(e) => onInput(e.target.value)} />;
}
```

### useEffectStream

Emits the dependency array as an observable whenever any dependency changes.

```typescript
function UserProfile({ userId }: { userId: string }) {
  const deps$ = useEffectStream([userId]);
  // deps$ emits [userId] every time userId changes
}
```

### usePipe

Applies an rxjs operator pipeline to a source observable once, returning a stable reference.

```typescript
const debounced$ = usePipe(input$, pipe(debounceTime(300)));
```

### useSubscription

Subscribes to an observable for the lifetime of the component, unsubscribing on unmount.

```typescript
useSubscription(clicks$, (event) => {
  console.log("clicked", event);
});
```

### useLatestState

Turns an observable into React state, re-rendering on each emission.

```tsx
function Counter({ count$ }: { count$: Observable<number> }) {
  const count = useLatestState(count$, 0);
  return <span>{count}</span>;
}
