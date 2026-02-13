import { createContext, useContext } from "react";
import { EventBus } from "./EventBus.js";

const EventBusContext = createContext(new EventBus());

export const EventBusProvider = EventBusContext.Provider;

export function useEventBus(): EventBus {
  const eventBus = useContext(EventBusContext);
  return eventBus;
}
