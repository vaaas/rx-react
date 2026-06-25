import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  BehaviorSubject,
  Observable,
  Observer,
  Subject,
  UnaryFunction,
} from "rxjs";

/**
 * Returns a value that is constant for the lifetime of the component.
 *
 * The factory runs once on mount; subsequent renders return the same value.
 * Unlike `useMemo`, which React may discard and recompute as a memory-saving
 * heuristic, the returned value is guaranteed stable. Unlike `useRef`, the
 * value is returned directly rather than wrapped in a `.current` shell.
 *
 * Useful for any per-component singleton: subjects, observables, class
 * instances, anything else where reference stability is load-bearing.
 */
export function useConstant<X>(factory: () => X): X {
  const ref = useRef<X | null>(null);
  if (ref.current === null) ref.current = factory();
  return ref.current;
}

/**
 * Bridges React dependencies into an observable stream.
 *
 * Pass one argument and the stream emits scalar values; pass several and it
 * emits a tuple of the same shape. Backed by a BehaviorSubject so subscribers
 * attached after mount still receive the latest value.
 *
 * The dependency list doubles as React's effect dep array, so emissions track
 * `Object.is` changes the same way `useEffect` does.
 */
export function useEffectStream<X extends unknown[]>(
  ...deps: X
): BehaviorSubject<X extends [infer A] ? A : X> {
  type V = X extends [infer A] ? A : X;
  const value = (deps.length === 1 ? deps[0] : deps) as V;
  const stream = useConstant(() => new BehaviorSubject<V>(value));

  useEffect(() => {
    if (stream.value !== value) stream.next(value);
  }, deps);

  return stream;
}

/**
 * Creates a stable Subject and a callback to push values into it.
 * Useful for turning React event handlers into observable sources where
 * "current value" is not meaningful (clicks, keystrokes, etc.).
 *
 * For component-local reactive state, prefer `useBehaviorSubject`.
 */
export function useSubject<X extends unknown = undefined>(): [
  Subject<X>,
  UnaryFunction<X, void>,
] {
  return useConstant((): [Subject<X>, UnaryFunction<X, void>] => {
    const subject = new Subject<X>();
    return [subject, (x: X = undefined) => subject.next(x)];
  });
}

/**
 * Creates a stable BehaviorSubject seeded with an initial value or a lazy
 * initializer.
 *
 * Use the function form for expensive initials — like `useState`, the function
 * is called once on mount and never re-evaluated.
 *
 * Callers can push imperatively via `.next(x)` and read synchronously via
 * `.value`, which is convenient inside event handlers that don't want to
 * subscribe.
 */
export function useBehaviorSubject<X>(
  initial: X | (() => X),
): BehaviorSubject<X> {
  return useConstant(() => {
    const value =
      typeof initial === "function" ? (initial as () => X)() : initial;
    return new BehaviorSubject<X>(value);
  });
}

/**
 * Builds an observable from a factory once and returns a stable reference.
 *
 * The factory runs a single time per component instance; subsequent renders
 * return the same observable. Use it for both single-source pipelines and
 * multi-source derivations (e.g. `combineLatest`) — no dep array, by design.
 */
export function useObservable<X>(factory: () => Observable<X>): Observable<X> {
  return useConstant(factory);
}

/** An observer or a simple callback that can be passed to `useSubscription`. */
export type Listener<X> = Partial<Observer<X>> | UnaryFunction<X, void>;

/**
 * Subscribes to an observable for the lifetime of the component, unsubscribing
 * on unmount and re-subscribing only when `source` changes.
 *
 * The observer is captured by ref, so inline arrow functions are safe — the
 * latest closure is always invoked without triggering a resubscribe. This
 * preserves replay-buffered emissions on cold sources and avoids
 * subscribe/unsubscribe churn on hot ones.
 */
export function useSubscription<X>(
  source: Observable<X>,
  observer: Listener<X>,
): void {
  const ref = useRef(observer);
  useEffect(() => {
    ref.current = observer;
  });

  useEffect(() => {
    const subscription = source.subscribe({
      next: (x: X) => {
        const current = ref.current;
        if (typeof current === "function") current(x);
        else current.next?.(x);
      },
      error: (err: unknown) => {
        const current = ref.current;
        if (typeof current !== "function") current.error?.(err);
      },
      complete: () => {
        const current = ref.current;
        if (typeof current !== "function") current.complete?.();
      },
    });
    return () => subscription.unsubscribe();
  }, [source]);
}

/**
 * Subscribes to an observable and returns its latest emission as React state.
 *
 * Built on `useSyncExternalStore`, so reads are tearing-safe under concurrent
 * React: the current value is read synchronously during render and React
 * reconciles any change that lands in the commit-to-subscribe gap.
 *
 * The seed is the source's own current value whenever it has one — a
 * `BehaviorSubject` (`source.value`), or any other *behavior* observable that
 * emits synchronously on subscription, such as a `store.select(...)`
 * derivation. Those need no `initial` and never flash a placeholder. Pass
 * `initial` only for a source that does not emit synchronously (a cold or
 * event-driven `Observable`); it seeds the first render until the source emits.
 */
export function useLatestState<X>(source: BehaviorSubject<X>): X;
export function useLatestState<X>(source: Observable<X>, initial?: X): X;
export function useLatestState<X>(
  source: Observable<X> | BehaviorSubject<X>,
  initial?: X,
): X {
  const latest = useRef<X>();
  if (latest.current === undefined) {
    latest.current = seedValue(source, initial);
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = source.subscribe((value: X) => {
        latest.current = value;
        onChange();
      });
      return () => subscription.unsubscribe();
    },
    [source],
  );

  const getSnapshot =
    source instanceof BehaviorSubject
      ? () => source.value
      : () => latest.current as X;

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function seedValue<X>(source: Observable<X>, initial?: X): X {
  if (source instanceof BehaviorSubject) return source.value;
  let value: X;
  let emitted = false;
  const subscription = source.subscribe((x: X) => {
    if (!emitted) {
      value = x;
      emitted = true;
    }
  });
  subscription.unsubscribe();
  return emitted ? value! : (initial as X);
}
