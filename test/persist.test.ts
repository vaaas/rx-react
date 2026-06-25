import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "../src/store.js";
import {
  persist,
  webStorageDriver,
  localStorageDriver,
  sessionStorageDriver,
  cacheStorageDriver,
  type StorageDriver,
} from "../src/persist.js";

function memoryDriver(seed: Record<string, string> = {}): StorageDriver & {
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function asyncMemoryDriver(seed: Record<string, string> = {}): StorageDriver & {
  store: Map<string, string>;
} {
  const sync = memoryDriver(seed);
  return {
    store: sync.store,
    getItem: (key) => Promise.resolve(sync.getItem(key) as string | null),
    setItem: (key, value) => Promise.resolve(sync.setItem(key, value)),
    removeItem: (key) => Promise.resolve(sync.removeItem(key)),
  };
}

function envelope(state: unknown, version = 0): string {
  return JSON.stringify({ state, version });
}

describe("web storage drivers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("round-trips through localStorage", () => {
    localStorageDriver.setItem("k", "v");
    expect(localStorageDriver.getItem("k")).toEqual("v");
    localStorageDriver.removeItem("k");
    expect(localStorageDriver.getItem("k")).toEqual(null);
  });

  it("round-trips through sessionStorage", () => {
    sessionStorageDriver.setItem("k", "v");
    expect(sessionStorageDriver.getItem("k")).toEqual("v");
    sessionStorageDriver.removeItem("k");
    expect(sessionStorageDriver.getItem("k")).toEqual(null);
  });

  it("wraps an arbitrary Storage via webStorageDriver", () => {
    const driver = webStorageDriver(() => sessionStorage);
    driver.setItem("k", "v");
    expect(sessionStorage.getItem("k")).toEqual("v");
  });
});

function fakeCacheStorage(): CacheStorage {
  const caches = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      let entries = caches.get(name);
      if (!entries) {
        entries = new Map();
        caches.set(name, entries);
      }
      const store = entries;
      return {
        match: async (req: RequestInfo | URL) =>
          store.get((req as Request).url),
        put: async (req: RequestInfo | URL, res: Response) => {
          store.set((req as Request).url, res);
        },
        delete: async (req: RequestInfo | URL) =>
          store.delete((req as Request).url),
      } as unknown as Cache;
    },
  } as unknown as CacheStorage;
}

describe("cacheStorageDriver", () => {
  it("round-trips through an injected CacheStorage", async () => {
    const driver = cacheStorageDriver("test", { caches: fakeCacheStorage() });

    expect(await driver.getItem("k")).toEqual(null);
    await driver.setItem("k", "v");
    expect(await driver.getItem("k")).toEqual("v");
    await driver.removeItem("k");
    expect(await driver.getItem("k")).toEqual(null);
  });
});

describe("persist — synchronous backend", () => {
  it("hydrates from storage before returning (no flash)", () => {
    const storage = memoryDriver({ app: envelope({ count: 7, name: "saved" }) });
    const store = persist(createStore({ count: 0, name: "init" }), {
      key: "app",
      storage,
    });

    expect(store.get()).toEqual({ count: 7, name: "saved" });
    expect(store.hasHydrated()).toBe(true);
  });

  it("shallow-merges persisted state over the seed", () => {
    const storage = memoryDriver({ app: envelope({ count: 7 }) });
    const store = persist(createStore({ count: 0, name: "init" }), {
      key: "app",
      storage,
    });

    expect(store.get()).toEqual({ count: 7, name: "init" });
  });

  it("leaves the seed untouched when nothing is persisted", () => {
    const storage = memoryDriver();
    const store = persist(createStore({ count: 0 }), { key: "app", storage });

    expect(store.get()).toEqual({ count: 0 });
  });

  it("writes back on change but not on hydration", () => {
    const storage = memoryDriver({ app: envelope({ count: 1 }) });
    const store = persist(createStore({ count: 0 }), { key: "app", storage });

    expect(JSON.parse(storage.store.get("app")!)).toEqual({
      state: { count: 1 },
      version: 0,
    });

    store.set({ count: 2 });

    expect(JSON.parse(storage.store.get("app")!)).toEqual({
      state: { count: 2 },
      version: 0,
    });
  });

  it("persists only the partialized slice", () => {
    const storage = memoryDriver();
    const store = persist(createStore({ count: 0, secret: "x" }), {
      key: "app",
      storage,
      partialize: (s) => ({ count: s.count }),
    });

    store.set({ count: 5 });

    expect(JSON.parse(storage.store.get("app")!)).toEqual({
      state: { count: 5 },
      version: 0,
    });
  });

  it("runs migrate on a version mismatch", () => {
    const storage = memoryDriver({ app: envelope({ n: 3 }, 1) });
    const store = persist(createStore({ count: 0 }), {
      key: "app",
      storage,
      version: 2,
      migrate: (persisted) => ({ count: (persisted as { n: number }).n }),
    });

    expect(store.get()).toEqual({ count: 3 });
  });

  it("reports an error and keeps the seed on a version mismatch with no migrate", () => {
    const onError = vi.fn();
    const storage = memoryDriver({ app: envelope({ count: 9 }, 1) });
    const store = persist(createStore({ count: 0 }), {
      key: "app",
      storage,
      version: 2,
      onError,
    });

    expect(store.get()).toEqual({ count: 0 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("reports an error and keeps the seed on corrupt JSON", () => {
    const onError = vi.fn();
    const storage = memoryDriver({ app: "{not json" });
    const store = persist(createStore({ count: 0 }), {
      key: "app",
      storage,
      onError,
    });

    expect(store.get()).toEqual({ count: 0 });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("persist — asynchronous backend", () => {
  it("shows the seed first, then the persisted value after hydration", async () => {
    const storage = asyncMemoryDriver({ app: envelope({ count: 42 }) });
    const store = persist(createStore({ count: 0 }), { key: "app", storage });

    expect(store.hasHydrated()).toBe(false);
    expect(store.get()).toEqual({ count: 0 });

    await store.hydrated;

    expect(store.hasHydrated()).toBe(true);
    expect(store.get()).toEqual({ count: 42 });
  });

  it("writes back through an async driver after hydration", async () => {
    const storage = asyncMemoryDriver();
    const store = persist(createStore({ count: 0 }), { key: "app", storage });
    await store.hydrated;

    store.set({ count: 3 });
    await Promise.resolve();

    expect(JSON.parse(storage.store.get("app")!)).toEqual({
      state: { count: 3 },
      version: 0,
    });
  });

  it("runs an async migrate", async () => {
    const storage = asyncMemoryDriver({ app: envelope({ n: 8 }, 1) });
    const store = persist(createStore({ count: 0 }), {
      key: "app",
      storage,
      version: 2,
      migrate: (persisted) =>
        Promise.resolve({ count: (persisted as { n: number }).n }),
    });

    await store.hydrated;

    expect(store.get()).toEqual({ count: 8 });
  });
});
