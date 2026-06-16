import { describe, expect, test } from "vite-plus/test";
import { createHistory } from "../src/index.ts";

const noop = { do: () => {}, undo: () => {} };

describe("checkpoints", () => {
  test("revertTo jumps to the marked position", () => {
    const history = createHistory();
    const form: Record<string, string> = {};
    const set = (key: string, value: string, prev: string) => ({
      do: () => {
        form[key] = value;
      },
      undo: () => {
        form[key] = prev;
      },
    });

    history.commit(set("name", "Bob", ""));
    history.checkpoint("saved");
    history.commit(set("email", "typo@", ""));
    history.commit(set("email", "oops", "typo@"));
    expect(form).toEqual({ name: "Bob", email: "oops" });

    history.revertTo("saved");
    expect(form).toEqual({ name: "Bob", email: "" });
    expect(history.position).toBe(1);
  });

  test("revertTo lands exactly even after eviction renumbers indices", () => {
    const history = createHistory({ limit: 4 });
    const log: string[] = [];
    const op = (id: string) => ({
      do: () => log.push(`do:${id}`),
      undo: () => log.push(`undo:${id}`),
    });

    history.commit(op("a"));
    history.commit(op("b"));
    history.checkpoint("cp"); // position 2, anchored to entry "b"
    history.commit(op("c"));
    history.commit(op("d"));
    history.commit(op("e")); // length 5 > 4 -> evict "a"; cp renumbers 2 -> 1

    expect(history.length).toBe(4);
    expect(history.hasCheckpoint("cp")).toBe(true);

    log.length = 0;
    history.revertTo("cp");
    expect(history.position).toBe(1);
    expect(log).toEqual(["undo:e", "undo:d", "undo:c"]);
  });

  test("re-tagging a checkpoint name moves it", () => {
    const history = createHistory();
    history.commit(noop);
    history.checkpoint("cp"); // position 1
    history.commit(noop);
    history.checkpoint("cp"); // re-tag at position 2

    history.undo();
    history.undo();
    expect(history.position).toBe(0);

    history.revertTo("cp");
    expect(history.position).toBe(2);
  });

  test("clear drops all entries and checkpoints", () => {
    const history = createHistory();
    history.commit(noop);
    history.checkpoint("cp");

    history.clear();
    expect(history.length).toBe(0);
    expect(history.position).toBe(0);
    expect(history.hasCheckpoint("cp")).toBe(false);
    expect(() => history.revertTo("cp")).toThrow();
  });

  test("a checkpoint whose anchor is evicted is pruned", () => {
    const history = createHistory({ limit: 2 });
    history.commit(noop);
    history.checkpoint("first"); // anchored to entry 0
    history.commit(noop);
    history.commit(noop); // evicts entry 0 -> "first" pruned

    expect(history.hasCheckpoint("first")).toBe(false);
    expect(() => history.revertTo("first")).toThrow();
  });

  test("a checkpoint in a dropped redo branch is pruned", () => {
    const history = createHistory();
    history.commit(noop); // e1
    history.commit(noop); // e2
    history.checkpoint("end"); // position 2, anchored to e2
    history.undo(); // position 1
    history.commit(noop); // drops e2 -> "end" pruned

    expect(history.hasCheckpoint("end")).toBe(false);
  });

  test("revertTo on an unknown name throws", () => {
    const history = createHistory();
    expect(() => history.revertTo("nope")).toThrow();
  });

  test("hasCheckpoint reflects existence", () => {
    const history = createHistory();
    expect(history.hasCheckpoint("x")).toBe(false);
    history.checkpoint("x");
    expect(history.hasCheckpoint("x")).toBe(true);
  });
});
