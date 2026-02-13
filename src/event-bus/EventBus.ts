import { Observable, Subject, Subscription, map } from "rxjs";
import { Constructible, EventParameter, Handler, Installer } from "./types.js";

export class EventBus {
  #subject: Subject<unknown>;
  #mappings: Map<
    unknown,
    {
      subject: Subject<EventParameter<any>>;
      handler: Observable<void>;
      subscription: Subscription;
    }
  >;

  constructor(mappings = new Map()) {
    this.#subject = new Subject();
    this.#mappings = mappings;

    const dispatch = this.dispatch.bind(this);
    const handler = this.#eventHandler.bind(this);
    this.#subject
      .pipe(map((event): EventParameter<any> => ({ event, dispatch })))
      .subscribe(handler);
  }

  dispatch<E extends Constructible>(event: E): this {
    this.#subject.next(event);
    return this;
  }

  on<E extends Constructible>(event: E, mapping: Handler<E>): this {
    const subject = new Subject<EventParameter<E>>();
    const observable = subject.pipe(mapping);
    const subscription = observable.subscribe();
    this.#mappings.set(event, {
      subject,
      handler: observable,
      subscription,
    });
    return this;
  }

  install(installer: Installer): EventBus {
    return installer(this);
  }

  #eventHandler<E extends Constructible>(parameter: EventParameter<E>): void {
    const mapping = this.#mappings.get(parameter.event.constructor);
    if (!mapping) return;
    const subject = mapping.subject;
    subject.next(parameter);
  }
}
