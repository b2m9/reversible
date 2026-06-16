import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";

describe("transaction", () => {
  test("one undo reverts an entire transaction, inverses in reverse order", () => {
    const history = createHistory();
    const log: string[] = [];

    history.transaction("type abc", (tx) => {
      for (const ch of "abc") {
        tx.commit({
          do: () => log.push(`do:${ch}`),
          undo: () => log.push(`undo:${ch}`),
        });
      }
    });
    expect(log).toEqual(["do:a", "do:b", "do:c"]);
    expect(history.length).toBe(1);

    history.undo();
    expect(log).toEqual(["do:a", "do:b", "do:c", "undo:c", "undo:b", "undo:a"]);
    expect(history.canUndo).toBe(false);

    log.length = 0;
    history.redo();
    expect(log).toEqual(["do:a", "do:b", "do:c"]);
  });

  test("a throwing operation rolls back applied operations and discards the entry", () => {
    const history = createHistory();
    const log: string[] = [];

    expect(() =>
      history.transaction("partial", (tx) => {
        tx.commit({
          do: () => log.push("do:a"),
          undo: () => log.push("undo:a"),
        });
        tx.commit({
          do: () => log.push("do:b"),
          undo: () => log.push("undo:b"),
        });
        tx.commit({
          do: () => {
            throw new Error("boom");
          },
          undo: () => {},
        });
      }),
    ).toThrow("boom");

    expect(log).toEqual(["do:a", "do:b", "undo:b", "undo:a"]);
    expect(history.length).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  test("a throw in the build callback rolls back and discards the entry", () => {
    const history = createHistory();
    const log: string[] = [];

    expect(() =>
      history.transaction("bug", (tx) => {
        tx.commit({
          do: () => log.push("do:a"),
          undo: () => log.push("undo:a"),
        });
        throw new Error("user bug");
      }),
    ).toThrow("user bug");

    expect(log).toEqual(["do:a", "undo:a"]);
    expect(history.length).toBe(0);
  });

  test("an empty transaction creates no entry and notifies no subscriber", () => {
    const history = createHistory();
    let calls = 0;
    history.subscribe(() => {
      calls += 1;
    });

    history.transaction("nothing", () => {});
    expect(history.length).toBe(0);
    expect(calls).toBe(0);
  });

  test("a nested transaction throws and the outer one rolls back", () => {
    const history = createHistory();
    const log: string[] = [];

    expect(() =>
      history.transaction("outer", (tx) => {
        tx.commit({
          do: () => log.push("do:a"),
          undo: () => log.push("undo:a"),
        });
        history.transaction("inner", () => {});
      }),
    ).toThrow();

    expect(log).toEqual(["do:a", "undo:a"]);
    expect(history.length).toBe(0);
  });
});
