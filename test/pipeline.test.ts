import { describe, it, expect } from "vitest";
import { firstValueFrom, lastValueFrom, of, toArray } from "rxjs";
import { ResultPipeline } from "../src/pipeline.js";

describe("ResultPipeline.map", () => {
  it("transforms values", async () => {
    const pipeline = ResultPipeline.start<number>()
      .map((n) => n + 1)
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([2, 3, 4]);
  });

  it("routes a thrown error to catch and keeps the stream alive", async () => {
    const seen: string[] = [];
    const pipeline = ResultPipeline.start<number>()
      .map((n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
      .catch((e) => seen.push(e.message));

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([1, 3]);
    expect(seen).toEqual(["boom"]);
  });

  it("short-circuits downstream stages once a value becomes an error", async () => {
    const pipeline = ResultPipeline.start<number>()
      .map((n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
      .map((n) => n * 10)
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([10, 30]);
  });
});

describe("ResultPipeline.filter", () => {
  it("drops values failing a boolean predicate", async () => {
    const pipeline = ResultPipeline.start<number>()
      .filter((n) => n % 2 === 0)
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3, 4)).pipe(toArray()));

    expect(values).toEqual([2, 4]);
  });

  it("narrows the value type for downstream stages via a type guard", async () => {
    const pipeline = ResultPipeline.start<string | null>()
      .filter((v): v is string => v !== null)
      .map((v) => v.toUpperCase())
      .catch(() => {});

    const values = await lastValueFrom(
      pipeline(of("a", null, "b")).pipe(toArray()),
    );

    expect(values).toEqual(["A", "B"]);
  });
});

describe("ResultPipeline.tap", () => {
  it("runs a side effect and passes the value through unchanged", async () => {
    const seen: number[] = [];
    const pipeline = ResultPipeline.start<number>()
      .tap((n) => seen.push(n))
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2)).pipe(toArray()));

    expect(values).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });
});

describe("ResultPipeline.filterMap", () => {
  it("drops null/undefined returns and passes transformed values through", async () => {
    const pipeline = ResultPipeline.start<number>()
      .filterMap((n) => (n % 2 === 0 ? `even:${n}` : null))
      .catch(() => {});

    const values = await lastValueFrom(
      pipeline(of(1, 2, 3, 4, 5, 6)).pipe(toArray()),
    );

    expect(values).toEqual(["even:2", "even:4", "even:6"]);
  });

  it("awaits async returns, dropping resolved null/undefined", async () => {
    const pipeline = ResultPipeline.start<number>()
      .filterMap(async (n) => (n > 2 ? n * 10 : undefined))
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3, 4)).pipe(toArray()));

    expect(values).toEqual([30, 40]);
  });

  it("routes thrown errors to catch and keeps the stream alive", async () => {
    const seen: string[] = [];
    const pipeline = ResultPipeline.start<number>()
      .filterMap((n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
      .catch((e) => seen.push(e.message));

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([1, 3]);
    expect(seen).toEqual(["boom"]);
  });
});

describe("ResultPipeline.concatMap", () => {
  it("awaits promises", async () => {
    const pipeline = ResultPipeline.start<number>()
      .concatMap(async (n) => n * 2)
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([2, 4, 6]);
  });

  it("flattens observables", async () => {
    const pipeline = ResultPipeline.start<number>()
      .concatMap((n) => of(n, n))
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2)).pipe(toArray()));

    expect(values).toEqual([1, 1, 2, 2]);
  });

  it("routes a rejected promise to catch", async () => {
    const seen: string[] = [];
    const pipeline = ResultPipeline.start<number>()
      .concatMap(async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
      .catch((e) => seen.push(e.message));

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([1, 3]);
    expect(seen).toEqual(["boom"]);
  });
});

describe("ResultPipeline.recover", () => {
  it("converts an error back into a value", async () => {
    const pipeline = ResultPipeline.start<number>()
      .map((n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
      .recover(() => -1)
      .catch(() => {});

    const values = await lastValueFrom(pipeline(of(1, 2, 3)).pipe(toArray()));

    expect(values).toEqual([1, -1, 3]);
  });
});

describe("ResultPipeline.delay", () => {
  it("delays the emission by at least the requested duration", async () => {
    const pipeline = ResultPipeline.start<number>()
      .delay(25)
      .catch(() => {});

    const t0 = Date.now();
    const value = await firstValueFrom(pipeline(of(7)));
    const elapsed = Date.now() - t0;

    expect(value).toBe(7);
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});
