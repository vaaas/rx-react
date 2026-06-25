import { useCallback } from "react";
import {
  BehaviorSubject,
  Observable,
  distinctUntilChanged,
  map,
} from "rxjs";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector.js";

/**
 * One-level structural equality over objects and arrays.
 *
 * Returns true when `a` and `b` are the same reference, or are non-null
 * objects/arrays with the same set of keys whose values are each
 * `Object.is`-equal. Comparison is exactly one level deep — nested objects are
 * compared by reference, not structurally.
 *
 * Pair it with the `equalityFn` parameter of `useStoreSelector` to select an
 * object or array slice without re-rendering on every emission.
 */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;

  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const keys = Object.keys(ra);
  if (keys.length !== Object.keys(rb).length) return false;

  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rb, key) &&
      Object.is(ra[key], rb[key]),
  );
}

/**
 * Subscribes to a slice of an externally-owned `BehaviorSubject` and returns it
 * as React state.
 *
 * Built on `useSyncExternalStoreWithSelector`, so reads are tearing-safe under
 * concurrent React and the component re-renders only when the selected slice
 * changes per `equalityFn` (default `Object.is`). The snapshot is read
 * synchronously from `source$.value`, so the first render already holds the
 * real value — no placeholder flash.
 *
 * For object or array slices, pass `shallow` as `equalityFn` to avoid
 * re-rendering when the selected shape is structurally unchanged.
 */
export function useStoreSelector<S, R>(
  source$: BehaviorSubject<S>,
  selector: (state: S) => R,
  equalityFn?: (a: R, b: R) => boolean,
): R {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = source$.subscribe(() => onChange());
      return () => subscription.unsubscribe();
    },
    [source$],
  );

  const getSnapshot = useCallback(() => source$.value, [source$]);

  return useSyncExternalStoreWithSelector(
    subscribe,
    getSnapshot,
    getSnapshot,
    selector,
    equalityFn,
  );
}

/**
 * A thin reactive store over a `BehaviorSubject`, restoring the ergonomics a
 * raw subject lacks: shallow-merge updates, a synchronous read, and a
 * derivation that both the imperative and reactive paths can share.
 */
export interface Store<S> {
  /** The underlying subject — pass it to `useStoreSelector` for React reads. */
  value$: BehaviorSubject<S>;
  /** Reads the current state synchronously. Equivalent to `value$.value`. */
  get(): S;
  /**
   * Shallow-merges a partial (or the result of a function of the current
   * state) into the state and emits — the `next()` ergonomics `BehaviorSubject`
   * lacks.
   */
  set(partial: Partial<S> | ((state: S) => Partial<S>)): void;
  /** Replaces the whole state with the result of `fn`. */
  update(fn: (state: S) => S): void;
  /**
   * Derives a slice as an observable, suppressing consecutive duplicates per
   * `eq` (default reference equality). Defines the derivation once so the
   * synchronous (`selector(get())`) and reactive paths don't drift apart.
   */
  select<R>(selector: (state: S) => R, eq?: (a: R, b: R) => boolean): Observable<R>;
}

/**
 * Creates a {@link Store} seeded with `initial`. Pure rxjs — no React — so it
 * can be constructed once at app wiring and injected wherever state is owned.
 */
export function createStore<S extends object>(initial: S): Store<S> {
  const value$ = new BehaviorSubject<S>(initial);

  return {
    value$,
    get: () => value$.value,
    set: (partial) => {
      const current = value$.value;
      const next = typeof partial === "function" ? partial(current) : partial;
      value$.next({ ...current, ...next });
    },
    update: (fn) => value$.next(fn(value$.value)),
    select: (selector, eq) =>
      value$.pipe(map(selector), distinctUntilChanged(eq)),
  };
}
