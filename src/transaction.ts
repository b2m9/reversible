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
 * True if `value` is a thenable (exposes a callable `then`). The single source of
 * truth for the engine's synchronous-only contract: a `do`/`undo` or transaction
 * builder that returns one has detached work the engine can never reverse.
 */
export function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { then?: unknown }).then === "function"
  );
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
  // The builder is valid only for the synchronous span of `build`. Once that
  // returns (or throws), `closed` rejects any captured/escaped `tx.commit` so a
  // late op can neither mutate state untracked nor push onto the live `ops` array
  // the recorded entry closes over.
  let closed = false;
  const tx: TransactionBuilder = {
    commit(action) {
      if (closed) {
        throw new Error("reversible: transaction builder used after the transaction finished");
      }
      engine.runGuarded(action.do);
      // Copy the op; don't retain the caller's mutable action object.
      ops.push({ do: action.do, undo: action.undo });
    },
  };

  try {
    const result = (build as (tx: TransactionBuilder) => unknown)(tx);
    closed = true;
    // An async builder records only its synchronous prefix and lets later commits
    // escape; reject it loudly, matching the sync-only contract on do/undo.
    if (isThenable(result)) {
      // A real promise's detached continuation hits `closed`, rejects, and would
      // crash the host; swallow that rejection. Narrow to actual promises so we
      // never assimilate (and thereby run) an arbitrary thenable's `then`.
      if (result instanceof Promise) void result.catch(() => {});
      throw new TypeError(
        "reversible: transaction builder must be synchronous (it returned a thenable)",
      );
    }
  } catch (error) {
    closed = true;
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
