import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";
import type { TransactionBuilder } from "../src/index.ts";

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

  test("the builder is rejected once the transaction has finished", () => {
    const history = createHistory();
    const log: string[] = [];
    let escaped: TransactionBuilder | undefined;

    history.transaction("capture", (tx) => {
      escaped = tx;
      tx.commit({
        do: () => log.push("do:a"),
        undo: () => log.push("undo:a"),
      });
    });
    expect(history.length).toBe(1);

    // An escaped builder cannot mutate state or corrupt the recorded entry.
    expect(() =>
      escaped?.commit({
        do: () => log.push("do:late"),
        undo: () => {},
      }),
    ).toThrow();
    expect(log).toEqual(["do:a"]);
    expect(history.length).toBe(1);
  });

  test("a real async builder throws synchronously, rolls back, and does not crash the host", async () => {
    const history = createHistory();
    const log: string[] = [];
    let calls = 0;
    history.subscribe(() => {
      calls += 1;
    });

    let unhandled: unknown;
    const onUnhandled = (reason: unknown): void => {
      unhandled = reason;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      // A genuine async builder: it records its synchronous prefix, suspends, then
      // tries to commit again from its detached continuation.
      expect(() =>
        history.transaction("async", async (tx) => {
          tx.commit({
            do: () => log.push("do:a"),
            undo: () => log.push("undo:a"),
          });
          await Promise.resolve();
          tx.commit({
            do: () => log.push("do:b"),
            undo: () => {},
          });
        }),
      ).toThrow("synchronous");

      // The synchronous prefix applied, then rolled back; nothing recorded or notified.
      expect(log).toEqual(["do:a", "undo:a"]);
      expect(history.length).toBe(0);
      expect(calls).toBe(0);

      // Let the detached continuation run: its late commit is rejected, never applies,
      // and its rejection is swallowed rather than taking the host process down.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(log).toEqual(["do:a", "undo:a"]);
      expect(history.length).toBe(0);
      expect(unhandled).toBeUndefined();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("a returned custom thenable is rejected without being assimilated", async () => {
    const history = createHistory();
    let thenInvoked = false;

    // A lazy thenable, not a real promise. The engine must reject it as a sync
    // violation without ever invoking its `then` — doing so would run the detached
    // code the guard forbids.
    const thenable: Record<string, unknown> = {};
    // eslint-disable-next-line unicorn/no-thenable -- assigning `then` is the test's whole point
    thenable.then = () => {
      thenInvoked = true;
    };

    expect(() => history.transaction("thenable", () => thenable)).toThrow("synchronous");
    expect(history.length).toBe(0);

    // Give any accidental assimilation a microtask to fire; it must not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(thenInvoked).toBe(false);
  });
});
