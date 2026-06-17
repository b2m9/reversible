import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";

const noop = { do: () => {}, undo: () => {} };

describe("undo / redo / jump", () => {
  test("undo at the start and redo at the end are no-ops returning false", () => {
    const history = createHistory();
    expect(history.undo()).toBe(false);

    history.commit(noop);
    expect(history.redo()).toBe(false);

    history.undo();
    expect(history.undo()).toBe(false);
  });

  test("jump clamps at the ends and returns the signed steps moved", () => {
    const history = createHistory();
    for (let i = 0; i < 3; i += 1) history.commit(noop);

    expect(history.jump(-5)).toBe(-3); // clamps to the start
    expect(history.position).toBe(0);

    expect(history.jump(10)).toBe(3); // clamps to the end
    expect(history.position).toBe(3);

    expect(history.jump(0)).toBe(0);
  });

  test("a throw mid-jump stops at the last successful step and rethrows", () => {
    const history = createHistory();
    let value = 0;

    history.commit({
      do: () => {
        value = 1;
      },
      undo: () => {
        value = 0;
      },
    });
    history.commit({
      do: () => {
        value = 2;
      },
      undo: () => {
        throw new Error("cannot undo step 2");
      },
    });
    history.commit({
      do: () => {
        value = 3;
      },
      undo: () => {
        value = 2;
      },
    });

    // jump(-3): undo step 3 (value -> 2), then step 2's undo throws.
    expect(() => history.jump(-3)).toThrow("cannot undo step 2");
    expect(history.position).toBe(2);
    expect(value).toBe(2);
  });

  test("position tracks the cursor across commit/undo/redo/jump", () => {
    const history = createHistory();
    expect(history.position).toBe(0);

    history.commit(noop);
    history.commit(noop);
    expect(history.position).toBe(2);

    history.undo();
    expect(history.position).toBe(1);

    history.jump(-1);
    expect(history.position).toBe(0);

    history.jump(2);
    expect(history.position).toBe(2);
    expect(history.length).toBe(2);
  });

  test("interleaved commit/undo/redo never reorder operations", () => {
    const history = createHistory();
    const log: string[] = [];
    const op = (id: string) => ({
      do: () => log.push(`do:${id}`),
      undo: () => log.push(`undo:${id}`),
    });

    history.commit(op("a"));
    history.commit(op("b"));
    history.undo(); // undo b
    history.undo(); // undo a
    history.redo(); // do a
    history.commit(op("c")); // drops b
    history.undo(); // undo c
    history.redo(); // do c

    expect(log).toEqual(["do:a", "do:b", "undo:b", "undo:a", "do:a", "do:c", "undo:c", "do:c"]);
  });
});
