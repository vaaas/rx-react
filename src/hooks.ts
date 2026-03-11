import { useCallback, useEffect, useRef, useState } from "react";
import { Observable, Observer, Subject, UnaryFunction } from "rxjs";

/**
 * Creates a Subject that emits the given dependency array whenever any dependency changes,
 * bridging React's effect lifecycle into an observable stream.
 */
export function useEffectStream<X extends unknown[]>(deps: [...X]): Subject<X> {
  const stream = useRef(new Subject<X>());

  useEffect(() => {
    stream.current.next(deps);
  }, deps);

  return stream.current;
}

/**
 * Creates a stable Subject and a callback to push values into it.
 * Useful for turning React event handlers into observable sources.
 */
export function useSubject<X extends unknown = undefined>(): [
  Subject<X>,
  UnaryFunction<X, void>,
] {
  const stream = useRef(new Subject<X>());

  const next = useCallback(
    function next(x: X = undefined): void {
      stream.current.next(x);
    },
    [stream.current],
  );

  return [stream.current, next];
}

/**
 * Applies an rxjs operator pipeline to a source observable once and returns a stable reference to the resulting observable.
 */
export function usePipe<A, B>(
  source: Observable<A>,
  pipe: UnaryFunction<Observable<A>, Observable<B>>,
): Observable<B> {
  const result = useRef(source.pipe(pipe));
  return result.current;
}

/** An observer or a simple callback that can be passed to `useSubscription`. */
export type Listener<X> = Partial<Observer<X>> | UnaryFunction<X, void>;

/**
 * Subscribes to an observable for the lifetime of the component,
 * automatically unsubscribing on unmount or when the source/observer changes.
 * Useful for running side-effects.
 */
export function useSubscription<X>(
  source: Observable<X>,
  observer: Listener<X>,
) {
  useEffect(() => {
    const subscription = source.subscribe(observer);
    return () => subscription.unsubscribe();
  }, [source, observer]);
}

/**
 * Subscribes to an observable and returns its latest emitted value as React state,
 * starting with the provided initial value.
 * Turns an observable into react state.
 */
export function useLatestState<X>(source: Observable<X>, initial: X) {
  const [state, setState] = useState<X>(initial);
  useSubscription(source, setState);

  return state;
}
