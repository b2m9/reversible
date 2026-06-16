import type { Reversible, TransactionBuilder } from "./types.ts";

/** An internal history entry. A transaction collapses to exactly one of these. */
export interface Entry {
  label?: string;
  do: () => void;
  undo: () => void;
}

/**
 * The slice of engine internals the transaction builder needs. Kept tiny so the
 * builder owns rollback without reaching into the rest of the core.
 */
export interface EngineInternals {
  assertIdle(): void;
  beginMutation(): void;
  endMutation(): void;
  runGuarded(fn: () => void): void;
  append(entry: Entry): void;
  notify(): void;
}

/**
 * Run a transaction: apply each committed operation eagerly, and on success
 * collapse them into one entry whose `do` replays forward and whose `undo`
 * replays the inverses in strict reverse order.
 *
 * If anything throws before `build` returns — a committed op or the build
 * callback itself — the applied operations roll back in reverse and no entry is
 * recorded. Best-effort: if a rollback inverse itself throws, that error
 * surfaces and rollback stops.
 */
export function runTransaction(
  engine: EngineInternals,
  label: string,
  build: (tx: TransactionBuilder) => void,
): void {
  engine.assertIdle();
  engine.beginMutation();

  const ops: Reversible[] = [];
  const tx: TransactionBuilder = {
    commit(action) {
      engine.runGuarded(action.do);
      ops.push(action);
    },
  };

  try {
    build(tx);
  } catch (error) {
    try {
      for (let i = ops.length - 1; i >= 0; i -= 1) {
        engine.runGuarded(ops[i].undo);
      }
    } finally {
      engine.endMutation();
    }
    throw error;
  }

  engine.endMutation();

  // An empty transaction creates no entry and notifies no subscriber.
  if (ops.length === 0) return;

  engine.append({
    label,
    do() {
      for (const op of ops) engine.runGuarded(op.do);
    },
    undo() {
      for (let i = ops.length - 1; i >= 0; i -= 1) {
        engine.runGuarded(ops[i].undo);
      }
    },
  });
  engine.notify();
}
