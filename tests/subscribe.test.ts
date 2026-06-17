import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";
import type { HistoryMeta } from "../src/index.ts";

const noop = { do: () => {}, undo: () => {} };

describe("subscribe", () => {
  test("fires on every change with correct meta", () => {
    const history = createHistory();
    const metas: HistoryMeta[] = [];
    history.subscribe((m) => metas.push(m));

    history.commit({ label: "a", do: () => {}, undo: () => {} });
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: "a",
      position: 1,
      length: 1,
    });

    history.undo();
    expect(metas).toHaveLength(2);
    expect(metas[1]).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: "a",
      position: 0,
      length: 1,
    });
  });

  test("a no-op does not fire the subscriber", () => {
    const history = createHistory();
    let calls = 0;
    history.subscribe(() => {
      calls += 1;
    });

    expect(history.undo()).toBe(false); // boundary no-op
    expect(() =>
      history.commit({
        do: () => {
          throw new Error("x");
        },
        undo: () => {},
      }),
    ).toThrow();
    history.clear(); // already empty -> no change

    expect(calls).toBe(0);
  });

  test("the returned unsubscribe stops notifications", () => {
    const history = createHistory();
    let calls = 0;
    const off = history.subscribe(() => {
      calls += 1;
    });

    history.commit(noop);
    expect(calls).toBe(1);

    off();
    history.commit(noop);
    expect(calls).toBe(1);
  });

  test("the delivered meta is frozen", () => {
    const history = createHistory();
    let received: HistoryMeta | undefined;
    history.subscribe((m) => {
      received = m;
    });
    history.commit(noop);

    expect(Object.isFrozen(received)).toBe(true);
  });
});
