import { useCallback, useEffect, useRef, useState } from "react";
import { Observable, Observer, Subject, UnaryFunction } from "rxjs";

export function useEffectStream<X extends unknown[]>(deps: [...X]): Subject<X> {
  const stream = useRef(new Subject<X>());

  useEffect(() => {
    stream.current.next(deps);
  }, deps);

  return stream.current;
}

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

export function usePipe<A, B>(
  source: Observable<A>,
  pipe: UnaryFunction<Observable<A>, Observable<B>>,
): Observable<B> {
  const result = useRef(source.pipe(pipe));
  return result.current;
}

export type Listener<X> = Partial<Observer<X>> | UnaryFunction<X, void>;

export function useSubscription<X>(
  source: Observable<X>,
  observer: Listener<X>,
) {
  useEffect(() => {
    const subscription = source.subscribe(observer);
    return () => subscription.unsubscribe();
  }, [source, observer]);
}

export function useLatestState<X>(source: Observable<X>, initial: X) {
  const [state, setState] = useState<X>(initial);
  useSubscription(source, setState);

  return state;
}
