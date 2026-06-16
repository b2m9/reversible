import type { History, HistoryMeta, HistoryOptions, Reversible } from "./types.ts";
import { type Entry, type EngineInternals, runTransaction } from "./transaction.ts";

/** Sentinel anchor for a checkpoint at position 0 (before all entries). */
const START = Symbol("reversible.start");
type Anchor = Entry | typeof START;

/**
 * Create a headless undo/redo engine. It tracks only the undo/redo stacks and a
 * cursor — your application state lives wherever it already does. See the
 * package brief for the full design.
 */
export function createHistory(options: HistoryOptions = {}): History {
  const { limit } = options;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new TypeError("reversible: limit must be a positive integer");
  }

  const entries: Entry[] = [];
  let cursor = 0;
  const checkpoints = new Map<string, Anchor>();
  const listeners = new Set<(meta: HistoryMeta) => void>();
  let mutating = false;

  /** Reentrancy guard: reject any public mutation while user code is running. */
  const assertIdle = (): void => {
    if (mutating) {
      throw new Error("reversible: reentrant engine call from inside a do/undo/rollback");
    }
  };

  /** Run a user operation, throwing loudly if it returns a thenable. */
  const runGuarded = (fn: () => void): void => {
    const result = (fn as () => unknown)();
    if (
      result !== null &&
      result !== undefined &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      throw new TypeError("reversible: do/undo must be synchronous (it returned a thenable)");
    }
  };

  const buildMeta = (): HistoryMeta =>
    Object.freeze({
      canUndo: cursor > 0,
      canRedo: cursor < entries.length,
      undoLabel: cursor > 0 ? entries[cursor - 1].label : undefined,
      redoLabel: cursor < entries.length ? entries[cursor].label : undefined,
      position: cursor,
      length: entries.length,
    });

  const notify = (): void => {
    if (listeners.size === 0) return;
    const meta = buildMeta();
    for (const listener of listeners) listener(meta);
  };

  const pruneCheckpoints = (removed: Entry[]): void => {
    if (checkpoints.size === 0 || removed.length === 0) return;
    const removedSet = new Set<Entry>(removed);
    for (const [name, anchor] of checkpoints) {
      if (anchor !== START && removedSet.has(anchor)) {
        checkpoints.delete(name);
      }
    }
  };

  const append = (entry: Entry): void => {
    // A fresh commit drops the redo branch (entries right of the cursor).
    if (cursor < entries.length) {
      pruneCheckpoints(entries.splice(cursor));
    }
    entries.push(entry);
    cursor += 1;
    // Evict the oldest entries past the cap.
    if (limit !== undefined && entries.length > limit) {
      const overflow = entries.length - limit;
      pruneCheckpoints(entries.splice(0, overflow));
      cursor -= overflow;
    }
  };

  /**
   * Walk the cursor `n` steps, running each inverse/forward op. Clamps at the
   * ends. May throw mid-way, leaving the cursor at the last successful step.
   */
  const traverse = (n: number): void => {
    const dir = n < 0 ? -1 : 1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      if (dir < 0) {
        if (cursor === 0) break;
        runGuarded(entries[cursor - 1].undo);
        cursor -= 1;
      } else {
        if (cursor === entries.length) break;
        runGuarded(entries[cursor].do);
        cursor += 1;
      }
      remaining -= 1;
    }
  };

  /** Guarded traversal shared by jump/undo/redo/revertTo. Returns steps moved (signed). */
  const move = (n: number): number => {
    const before = cursor;
    mutating = true;
    let caught: { error: unknown } | undefined;
    try {
      traverse(n);
    } catch (error) {
      caught = { error };
    } finally {
      mutating = false;
    }
    const moved = cursor - before;
    if (moved !== 0) notify();
    if (caught) throw caught.error;
    return moved;
  };

  const commit = (action: Reversible): void => {
    assertIdle();
    mutating = true;
    try {
      runGuarded(action.do);
    } catch (error) {
      // A failed commit records nothing and notifies no subscriber.
      mutating = false;
      throw error;
    }
    mutating = false;
    append({ label: action.label, do: action.do, undo: action.undo });
    notify();
  };

  const undo = (): boolean => {
    assertIdle();
    if (cursor === 0) return false;
    move(-1);
    return true;
  };

  const redo = (): boolean => {
    assertIdle();
    if (cursor === entries.length) return false;
    move(1);
    return true;
  };

  const jump = (n: number): number => {
    assertIdle();
    if (n === 0) return 0;
    return move(n);
  };

  const checkpoint = (name: string): void => {
    assertIdle();
    checkpoints.set(name, cursor === 0 ? START : entries[cursor - 1]);
  };

  const hasCheckpoint = (name: string): boolean => checkpoints.has(name);

  const revertTo = (name: string): void => {
    assertIdle();
    const anchor = checkpoints.get(name);
    if (anchor === undefined) {
      throw new Error(`reversible: unknown checkpoint "${name}"`);
    }
    const target = anchor === START ? 0 : entries.indexOf(anchor) + 1;
    move(target - cursor);
  };

  const clear = (): void => {
    assertIdle();
    if (entries.length === 0 && checkpoints.size === 0) return;
    entries.length = 0;
    cursor = 0;
    checkpoints.clear();
    notify();
  };

  const subscribe = (listener: (meta: HistoryMeta) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const internals: EngineInternals = {
    assertIdle,
    beginMutation: () => {
      mutating = true;
    },
    endMutation: () => {
      mutating = false;
    },
    runGuarded,
    append,
    notify,
  };

  return {
    commit,
    transaction: (label, build) => {
      runTransaction(internals, label, build);
    },
    undo,
    redo,
    jump,
    checkpoint,
    hasCheckpoint,
    revertTo,
    clear,
    subscribe,
    get canUndo() {
      return cursor > 0;
    },
    get canRedo() {
      return cursor < entries.length;
    },
    get undoLabel() {
      return cursor > 0 ? entries[cursor - 1].label : undefined;
    },
    get redoLabel() {
      return cursor < entries.length ? entries[cursor].label : undefined;
    },
    get position() {
      return cursor;
    },
    get length() {
      return entries.length;
    },
  };
}
