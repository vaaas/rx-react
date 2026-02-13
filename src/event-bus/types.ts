import { Observable, UnaryFunction } from "rxjs";
import { EventBus } from "./EventBus.js";

export interface Constructible {
  new (...args: any[]): any;
  constructor: Constructible;
}

export type Dispatch = UnaryFunction<Constructible, void>;

export type Handler<E extends Constructible> = UnaryFunction<
  Observable<EventParameter<E>>,
  Observable<void>
>;

export type Installer = UnaryFunction<EventBus, EventBus>;

export interface EventParameter<E extends Constructible> {
  event: E;
  dispatch: Dispatch;
}
