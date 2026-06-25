import {
  catchError,
  concatMap as rxConcatMap,
  delay as rxDelay,
  EMPTY,
  filter as rxFilter,
  from,
  map as rxMap,
  mergeMap as rxMergeMap,
  Observable,
  of,
  tap as rxTap,
  UnaryFunction,
} from "rxjs";

export type Result<T, E extends Error = Error> = T | E;

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export class ResultPipeline<TIn, T, E extends Error = Error> {
  private constructor(
    private readonly chain: (
      source$: Observable<TIn>,
    ) => Observable<Result<T, E>>,
  ) {}

  static start<T>(): ResultPipeline<T, T, never> {
    return new ResultPipeline<T, T, never>((source$) => source$);
  }

  map<U>(fn: (value: T) => U): ResultPipeline<TIn, U, E | Error> {
    return new ResultPipeline<TIn, U, E | Error>((source$) =>
      this.chain(source$).pipe(
        rxMap((r): Result<U, E | Error> => {
          if (r instanceof Error) return r;
          try {
            return fn(r as T);
          } catch (e) {
            return toError(e);
          }
        }),
      ),
    );
  }

  filter<S extends T>(
    pred: (value: T) => value is S,
  ): ResultPipeline<TIn, S, E | Error>;
  filter(pred: (value: T) => boolean): ResultPipeline<TIn, T, E | Error>;
  filter(pred: (value: T) => boolean): ResultPipeline<TIn, T, E | Error> {
    return new ResultPipeline<TIn, T, E | Error>((source$) =>
      this.chain(source$).pipe(
        rxMergeMap((r): Observable<Result<T, E | Error>> => {
          if (r instanceof Error) return of(r);
          try {
            return pred(r as T) ? of(r) : EMPTY;
          } catch (e) {
            return of(toError(e));
          }
        }),
      ),
    );
  }

  tap(fn: (value: T) => void): ResultPipeline<TIn, T, E | Error> {
    return new ResultPipeline<TIn, T, E | Error>((source$) =>
      this.chain(source$).pipe(
        rxMap((r): Result<T, E | Error> => {
          if (r instanceof Error) return r;
          try {
            fn(r as T);
            return r;
          } catch (e) {
            return toError(e);
          }
        }),
      ),
    );
  }

  /** filter + concatMap in one step: null/undefined drops the item,
   *  anything else proceeds transformed. */
  filterMap<U>(
    fn: (value: T) => U | null | undefined | Promise<U | null | undefined>,
  ): ResultPipeline<TIn, NonNullable<U>, E | Error> {
    return new ResultPipeline<TIn, NonNullable<U>, E | Error>((source$) =>
      this.chain(source$).pipe(
        rxConcatMap((r): Observable<Result<NonNullable<U>, E | Error>> => {
          if (r instanceof Error) return of(r);
          let inner$: Observable<U | null | undefined>;
          try {
            const out = fn(r as T);
            inner$ = out instanceof Promise ? from(out) : of(out);
          } catch (e) {
            return of(toError(e));
          }
          return inner$.pipe(
            rxMergeMap((v) => (v === null || v === undefined ? EMPTY : of(v))),
            catchError((e: unknown) =>
              of<Result<NonNullable<U>, E | Error>>(toError(e)),
            ),
          );
        }),
      ),
    );
  }

  concatMap<U>(
    fn: (value: T) => Promise<U> | Observable<U>,
  ): ResultPipeline<TIn, U, E | Error> {
    return new ResultPipeline<TIn, U, E | Error>((source$) =>
      this.chain(source$).pipe(
        rxConcatMap((r): Observable<Result<U, E | Error>> => {
          if (r instanceof Error) return of(r);
          let inner$: Observable<U>;
          try {
            const out = fn(r as T);
            inner$ = out instanceof Promise ? from(out) : out;
          } catch (e) {
            return of(toError(e));
          }
          return inner$.pipe(
            catchError((e: unknown) => of<Result<U, E | Error>>(toError(e))),
          );
        }),
      ),
    );
  }

  delay(ms: number): ResultPipeline<TIn, T, E> {
    return new ResultPipeline<TIn, T, E>((source$) =>
      this.chain(source$).pipe(rxDelay(ms)),
    );
  }

  recover(fn: (error: E) => T): ResultPipeline<TIn, T, Error> {
    return new ResultPipeline<TIn, T, Error>((source$) =>
      this.chain(source$).pipe(
        rxMap((r): Result<T, Error> => {
          if (!(r instanceof Error)) return r as T;
          try {
            return fn(r as E);
          } catch (e) {
            return toError(e);
          }
        }),
      ),
    );
  }

  catch(
    handler: (error: E) => void,
  ): UnaryFunction<Observable<TIn>, Observable<T>> {
    return (source$) =>
      this.chain(source$).pipe(
        rxTap((r) => {
          if (r instanceof Error) {
            try {
              handler(r as E);
            } catch (e) {
              console.error("ResultPipeline central handler threw:", e);
            }
          }
        }),
        rxFilter((r): r is T => !(r instanceof Error)),
      );
  }
}
