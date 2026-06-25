import { createContext, useContext, useRef } from "react";
import { Observable } from "rxjs";
import { Constructible } from "./event-bus.js";
import { useLatestState } from "./hooks.js";
import { shallow } from "./store.js";

/**
 * Read-side counterpart to the event bus: a typed router where a `Query<R>`
 * class resolves to a handler producing an `Observable<R>` over the stores.
 *
 * The phantom `__result` carries the result type so `useQuery`/`snapshot` infer
 * `R` from the query instance without it existing at runtime.
 */
export abstract class Query<R> {
  declare readonly __result: R;
}

export type QueryConstructor<R> = Constructible &
  (new (...args: any[]) => Query<R>);

/**
 * Resolves a query to a *behavior* observable — one that emits synchronously on
 * subscription. `store.select(...)` satisfies this by construction, since a
 * store always carries a current value.
 */
export type QueryHandler<Q, R> = (query: Q) => Observable<R>;

export type QueryInstaller = (bus: IQueryBus) => IQueryBus;

export interface IQueryBus {
  register<E extends QueryConstructor<R>, R>(
    ctor: E,
    handler: QueryHandler<InstanceType<E>, R>,
  ): this;
  install(installer: QueryInstaller): IQueryBus;
  /** The reactive read: the handler's observable for this query. */
  query<R>(query: Query<R>): Observable<R>;
  /** The synchronous read: the observable's current value. Total for store-backed handlers. */
  snapshot<R>(query: Query<R>): R;
}

type AnyHandler = QueryHandler<Query<unknown>, unknown>;

function firstSync<R>(source$: Observable<R>): R {
  let value: R;
  let emitted = false;
  const subscription = source$.subscribe((v) => {
    if (!emitted) {
      value = v;
      emitted = true;
    }
  });
  subscription.unsubscribe();
  if (!emitted) {
    throw new Error("QueryBus: handler observable did not emit synchronously");
  }
  return value!;
}

export class QueryBus implements IQueryBus {
  #handlers = new Map<Constructible, AnyHandler>();

  register<E extends QueryConstructor<R>, R>(
    ctor: E,
    handler: QueryHandler<InstanceType<E>, R>,
  ): this {
    this.#handlers.set(ctor, handler as unknown as AnyHandler);
    return this;
  }

  install(installer: QueryInstaller): IQueryBus {
    return installer(this);
  }

  query<R>(query: Query<R>): Observable<R> {
    return this.#lookup(query)(query) as Observable<R>;
  }

  snapshot<R>(query: Query<R>): R {
    return firstSync(this.query(query));
  }

  #lookup(query: Query<unknown>): AnyHandler {
    const ctor = (query as object).constructor as Constructible;
    const handler = this.#handlers.get(ctor);
    if (!handler) {
      throw new Error(`QueryBus: no handler for ${ctor.name}`);
    }
    return handler;
  }
}

export const QueryBusContext = createContext<IQueryBus>(new QueryBus());

export function useQueryBus(): IQueryBus {
  return useContext(QueryBusContext);
}

function sameQuery(a: Query<unknown>, b: Query<unknown>): boolean {
  return a.constructor === b.constructor && shallow(a, b);
}

/**
 * Reads a query as tearing-safe React state — `useLatestState` over the
 * handler's observable.
 *
 * The observable is memoised by query *value* (same class + `shallow`-equal
 * fields), so allocating a fresh `new GetX(args)` every render reuses one stable
 * subscription — query identity carries no re-render penalty.
 */
export function useQuery<R>(query: Query<R>): R {
  const bus = useQueryBus();
  const cache = useRef<{
    bus: IQueryBus;
    query: Query<R>;
    source$: Observable<R>;
  } | null>(null);

  if (
    cache.current === null ||
    cache.current.bus !== bus ||
    !sameQuery(cache.current.query, query)
  ) {
    cache.current = { bus, query, source$: bus.query(query) };
  }

  return useLatestState(cache.current.source$);
}
