import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";

const noop = { do: () => {}, undo: () => {} };

describe("limit", () => {
  test("the oldest entries are evicted past the limit", () => {
    const history = createHistory({ limit: 3 });
    for (let i = 0; i < 5; i += 1) history.commit(noop);

    expect(history.length).toBe(3);

    let undone = 0;
    while (history.undo()) undone += 1;
    expect(undone).toBe(3);
    expect(history.canUndo).toBe(false);
  });

  test("position stays within [0, length] under eviction", () => {
    const history = createHistory({ limit: 2 });
    for (let i = 0; i < 4; i += 1) history.commit(noop);

    expect(history.length).toBe(2);
    expect(history.position).toBe(2);
    expect(history.position).toBeLessThanOrEqual(history.length);
  });

  test("createHistory rejects a non-positive-integer limit", () => {
    expect(() => createHistory({ limit: 0 })).toThrow();
    expect(() => createHistory({ limit: -1 })).toThrow();
    expect(() => createHistory({ limit: 1.5 })).toThrow();
  });
});
