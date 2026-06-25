import { skip } from "rxjs";
import { Store } from "./store.js";

/**
 * The low-level, string-keyed storage contract every backend implements.
 *
 * Methods may be synchronous (localStorage) or asynchronous (the Cache API) —
 * returning a `Promise` switches `persist` into asynchronous hydration. Values
 * are always serialized strings; the envelope and JSON handling live in
 * `persist`, not here.
 */
export interface StorageDriver {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Wraps any DOM `Storage` (localStorage/sessionStorage) as a `StorageDriver`. */
export function webStorageDriver(getStorage: () => Storage): StorageDriver {
  return {
    getItem: (key) => getStorage().getItem(key),
    setItem: (key, value) => {
      getStorage().setItem(key, value);
    },
    removeItem: (key) => {
      getStorage().removeItem(key);
    },
  };
}

export const localStorageDriver: StorageDriver = webStorageDriver(
  () => localStorage,
);

export const sessionStorageDriver: StorageDriver = webStorageDriver(
  () => sessionStorage,
);

/**
 * Wraps the asynchronous Cache API as a `StorageDriver`, storing each value as
 * the body of a `Response` keyed by a synthetic same-store URL.
 *
 * The `CacheStorage` is injectable so it can be faked in tests without touching
 * the `caches` global.
 */
export function cacheStorageDriver(
  cacheName: string,
  options: { caches?: CacheStorage; origin?: string } = {},
): StorageDriver {
  const cacheStorage = options.caches ?? caches;
  const origin = options.origin ?? "https://rx-react.persist";
  const request = (key: string) =>
    new Request(`${origin}/${encodeURIComponent(key)}`);

  return {
    getItem: async (key) => {
      const cache = await cacheStorage.open(cacheName);
      const response = await cache.match(request(key));
      return response ? await response.text() : null;
    },
    setItem: async (key, value) => {
      const cache = await cacheStorage.open(cacheName);
      await cache.put(request(key), new Response(value));
    },
    removeItem: async (key) => {
      const cache = await cacheStorage.open(cacheName);
      await cache.delete(request(key));
    },
  };
}

interface StorageValue<P> {
  state: P;
  version?: number;
}

export interface PersistOptions<S, P = S> {
  /** Storage key. */
  key: string;
  /** Schema version stamped into the envelope. Default `0`. */
  version?: number;
  /** Backend driver. Default `localStorageDriver`. */
  storage?: StorageDriver;
  /** Selects the slice to persist. Default identity. */
  partialize?: (state: S) => P;
  /** Transforms an older persisted shape to the current one, on version mismatch. */
  migrate?: (persisted: unknown, version: number) => P | Promise<P>;
  /** Combines persisted state with the live state. Default one-level shallow merge. */
  merge?: (persisted: P, current: S) => S;
  /** Receives any storage/parse/migrate error instead of it being thrown. */
  onError?: (error: unknown) => void;
}

/** A `Store` augmented with hydration status for asynchronous backends. */
export interface PersistedStore<S> extends Store<S> {
  /** Resolves once hydration completes (already resolved for sync backends). */
  hydrated: Promise<void>;
  /** Whether hydration has finished. */
  hasHydrated(): boolean;
}

/**
 * Persists a {@link Store} to a {@link StorageDriver}: hydrates from storage on
 * creation (running `migrate` on a version mismatch and `merge`-ing the result
 * over the seed), then writes `partialize(state)` back on every change.
 *
 * Synchronous backends hydrate before this returns, so there is no placeholder
 * flash. Asynchronous backends hydrate later — await `hydrated` or poll
 * `hasHydrated()`; changes made before hydration completes may be overwritten
 * by the persisted state.
 */
export function persist<S extends object, P = S>(
  store: Store<S>,
  options: PersistOptions<S, P>,
): PersistedStore<S> {
  const {
    key,
    version = 0,
    storage = localStorageDriver,
    partialize = (state: S) => state as unknown as P,
    migrate,
    merge = (persisted, current) =>
      ({ ...current, ...(persisted as object) }) as S,
    onError = (error: unknown) => console.error(`[persist:${key}]`, error),
  } = options;

  let hydrated = false;

  const write = (state: S): void => {
    try {
      const envelope: StorageValue<P> = { state: partialize(state), version };
      const result = storage.setItem(key, JSON.stringify(envelope));
      if (result instanceof Promise) result.catch(onError);
    } catch (error) {
      onError(error);
    }
  };

  const applyPersisted = (persisted: P): void => {
    store.update((current) => merge(persisted, current));
  };

  const hydrateFrom = (raw: string | null): void | Promise<void> => {
    if (raw === null) return;
    const envelope = JSON.parse(raw) as StorageValue<P>;
    const stale =
      typeof envelope.version === "number" && envelope.version !== version;

    if (!stale) return applyPersisted(envelope.state);
    if (!migrate) {
      onError(
        new Error(
          `persisted version ${envelope.version} does not match ${version} and no migrate was provided`,
        ),
      );
      return;
    }
    const migrated = migrate(envelope.state, envelope.version ?? 0);
    if (migrated instanceof Promise) return migrated.then(applyPersisted);
    applyPersisted(migrated);
  };

  const finishHydration = (): void => {
    hydrated = true;
    store.value$.pipe(skip(1)).subscribe(write);
  };

  const hydrate = (): Promise<void> => {
    let raw: string | null | Promise<string | null>;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      onError(error);
      finishHydration();
      return Promise.resolve();
    }

    if (raw instanceof Promise) {
      return raw
        .then(hydrateFrom)
        .catch(onError)
        .then(finishHydration);
    }

    try {
      const pending = hydrateFrom(raw);
      if (pending instanceof Promise) {
        return pending.catch(onError).then(finishHydration);
      }
    } catch (error) {
      onError(error);
    }
    finishHydration();
    return Promise.resolve();
  };

  return { ...store, hydrated: hydrate(), hasHydrated: () => hydrated };
}
