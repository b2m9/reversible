import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";

describe("commit", () => {
  test("commit then undo then redo returns the target to its post-commit value", () => {
    const history = createHistory();
    let count = 0;

    history.commit({
      do: () => {
        count += 1;
      },
      undo: () => {
        count -= 1;
      },
    });
    expect(count).toBe(1);

    history.undo();
    expect(count).toBe(0);

    history.redo();
    expect(count).toBe(1);
  });

  test("carries labels for undoLabel / redoLabel", () => {
    const history = createHistory();
    history.commit({ label: "increment", do: () => {}, undo: () => {} });

    expect(history.undoLabel).toBe("increment");
    expect(history.redoLabel).toBeUndefined();

    history.undo();
    expect(history.undoLabel).toBeUndefined();
    expect(history.redoLabel).toBe("increment");
  });

  test("a failed commit records nothing and notifies no subscriber", () => {
    const history = createHistory();
    let calls = 0;
    history.subscribe(() => {
      calls += 1;
    });

    expect(() =>
      history.commit({
        do: () => {
          throw new Error("boom");
        },
        undo: () => {},
      }),
    ).toThrow("boom");

    expect(history.length).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(calls).toBe(0);
  });

  test("committing after an undo clears the redo branch", () => {
    const history = createHistory();
    const log: string[] = [];
    const op = (id: string) => ({
      do: () => log.push(`do:${id}`),
      undo: () => log.push(`undo:${id}`),
    });

    history.commit(op("a"));
    history.commit(op("b"));
    history.undo(); // undo b
    expect(history.canRedo).toBe(true);

    history.commit(op("c")); // drops b's redo branch
    expect(history.canRedo).toBe(false);
    expect(history.length).toBe(2); // a, c
  });
});
