import {
  Observable,
  Subject,
  Subscription,
  UnaryFunction,
  groupBy,
  map,
  mergeMap,
  tap,
} from "rxjs";
import { createContext, useContext } from "react";

interface Constructible {
  new (...args: any[]): any;
}

export interface EventParameter<E extends Constructible> {
  event: E;
  dispatch: Dispatch;
}

export type Handler<E extends Constructible> = UnaryFunction<
  Observable<EventParameter<InstanceType<E>>>,
  Observable<void>
>;

export type Installer = UnaryFunction<IEventBus, IEventBus>;

export interface IEventBus {
  dispatch: UnaryFunction<InstanceType<Constructible>, void>;
  on: <E extends Constructible>(event: E, handler: Handler<E>) => IEventBus;
  install: (installer: Installer) => IEventBus;
  start: () => IEventBus;
}

export type Dispatch = IEventBus["dispatch"];

export class EventBus implements IEventBus {
  #event$: Subject<unknown>;
  #mappings: Map<unknown, Handler<any>>;
  #subscription: Subscription;

  constructor(mappings = new Map()) {
    this.#mappings = mappings;
    this.#event$ = new Subject();
  }

  dispatch<E extends Constructible>(event: InstanceType<E>): this {
    this.#event$.next(event);
    return this;
  }

  on<E extends Constructible>(event: E, mapping: Handler<E>): this {
    this.#mappings.set(event, mapping);
    return this;
  }

  install(installer: Installer): IEventBus {
    return installer(this);
  }

  start(): this {
    if (this.#subscription) return this;
    const dispatch = this.dispatch.bind(this);
    this.#subscription = this.#event$
      .pipe(
        map(
          <T extends Constructible>(event: T): EventParameter<T> => ({
            event,
            dispatch,
          }),
        ),
        groupBy((param) => param.event.constructor),
        mergeMap((group$) => {
          const handler = this.#mappings.get(group$.key);
          if (handler) return group$.pipe(handler);
          else
            return group$.pipe(
              tap((x) =>
                console.warn("Unhandled event:", x.event.constructor.name),
              ),
            );
        }),
      )
      .subscribe();
    return this;
  }

  stop() {
    if (this.#subscription) this.#subscription.unsubscribe();
  }
}

export const EventBusContext = createContext<IEventBus>(new EventBus());

export function useEventBus(): IEventBus {
  const eventBus = useContext(EventBusContext);
  return eventBus;
}
