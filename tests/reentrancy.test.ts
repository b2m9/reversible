import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";
import type { History } from "../src/index.ts";

describe("reentrancy & synchronous guards", () => {
  test("every public mutation is rejected from inside a do", () => {
    const reentrantCalls: Array<(h: History) => void> = [
      (h) => h.commit({ do: () => {}, undo: () => {} }),
      (h) => h.undo(),
      (h) => h.redo(),
      (h) => h.jump(1),
      (h) => h.transaction("x", () => {}),
      (h) => h.clear(),
      (h) => h.revertTo("cp"),
      (h) => h.checkpoint("y"),
    ];

    for (const reentrant of reentrantCalls) {
      const history = createHistory();
      history.checkpoint("cp"); // give revertTo a target
      expect(() =>
        history.commit({
          do: () => reentrant(history),
          undo: () => {},
        }),
      ).toThrow();
      expect(history.length).toBe(0); // the failed commit recorded nothing
    }
  });

  test("a public mutation called from inside an undo throws", () => {
    const history = createHistory();
    let armed = false;
    history.commit({
      do: () => {},
      undo: () => {
        if (armed) history.commit({ do: () => {}, undo: () => {} });
      },
    });

    armed = true;
    expect(() => history.undo()).toThrow();
    expect(history.position).toBe(1); // cursor did not move
  });

  test("a do that returns a thenable throws instead of running detached", () => {
    const history = createHistory();
    expect(() => history.commit({ do: () => Promise.resolve(), undo: () => {} })).toThrow();
    expect(history.length).toBe(0);
  });

  test("an undo that returns a thenable throws", () => {
    const history = createHistory();
    history.commit({ do: () => {}, undo: () => Promise.resolve() });
    expect(() => history.undo()).toThrow();
    expect(history.position).toBe(1); // cursor did not move
  });

  test("a subscriber may safely call back into the engine", () => {
    const history = createHistory();
    let reentered = false;
    const off = history.subscribe(() => {
      if (!reentered) {
        reentered = true;
        // After the operation settles, mutations from a listener are allowed.
        history.clear();
      }
    });

    history.commit({ do: () => {}, undo: () => {} });
    off();
    expect(reentered).toBe(true);
    expect(history.length).toBe(0); // the listener's clear() ran
  });
});
