import {
  Observable,
  Subject,
  UnaryFunction,
  groupBy,
  map,
  mergeMap,
} from "rxjs";
import { createContext, useContext } from "react";

export interface Constructible {
  new (...args: any[]): any;
  constructor: Constructible;
}

export interface EventParameter<E extends Constructible> {
  event: E;
  dispatch: Dispatch;
}

export type Handler<E extends Constructible> = UnaryFunction<
  Observable<EventParameter<E>>,
  Observable<void>
>;

export type Installer = UnaryFunction<IEventBus, IEventBus>;

export interface IEventBus {
  dispatch: UnaryFunction<Constructible, void>;
  on: <E extends Constructible>(event: E, handler: Handler<E>) => IEventBus;
  install: (installer: Installer) => IEventBus;
  start: () => IEventBus;
}

export type Dispatch = IEventBus["dispatch"];

export class EventBus implements IEventBus {
  #event$: Subject<unknown>;
  #mappings: Map<unknown, Handler<any>>;

  constructor(mappings = new Map()) {
    this.#mappings = mappings;
    this.#event$ = new Subject();
  }

  dispatch<E extends Constructible>(event: E): this {
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
    const dispatch = this.dispatch.bind(this);
    this.#event$
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
          return handler && group$.pipe(handler);
        }),
      )
      .subscribe();
    return this;
  }
}

const EventBusContext = createContext<IEventBus>(new EventBus());

export const EventBusProvider = EventBusContext.Provider;

export function useEventBus(): IEventBus {
  const eventBus = useContext(EventBusContext);
  return eventBus;
}
