/**
 * A reversible operation: a `do`/`undo` pair the engine runs and remembers how
 * to reverse. Both must be **synchronous** and **true inverses** of each other —
 * that is the one responsibility the caller owns.
 */
export interface Reversible {
  /** Optional label, surfaced as `undoLabel`/`redoLabel` for UI tooltips. */
  label?: string;
  /** Run now and on every redo. Must be synchronous. */
  do: () => void;
  /** Run on undo. Must be synchronous. */
  undo: () => void;
}

/** The builder handed to a {@link History.transaction} callback. */
export interface TransactionBuilder {
  commit(action: Reversible): void;
}

/** A read-only snapshot of the engine's derived state, delivered to subscribers. */
export interface HistoryMeta {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
  readonly position: number;
  readonly length: number;
}

export interface History {
  /** Run an operation now and append it as a single undoable entry. */
  commit(action: Reversible): void;
  /**
   * Group many operations into one atomic entry. Operations apply eagerly; if
   * anything throws before `build` returns, the applied operations roll back in
   * reverse, the entry never enters history, and the error rethrows.
   */
  transaction(label: string, build: (tx: TransactionBuilder) => void): void;

  /** Undo one entry. Returns `false` (a no-op) at the start of history. */
  undo(): boolean;
  /** Redo one entry. Returns `false` (a no-op) at the end of history. */
  redo(): boolean;
  /**
   * Move `n` steps (`n < 0` undo, `n > 0` redo), clamped at the ends. Returns
   * the signed number of steps actually moved, so `jump(n) === n` means "fully
   * moved". A throw mid-jump stops at the last successful step and rethrows.
   */
  jump(n: number): number;

  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
  /**
   * Cursor index in `[0, length]`. `canUndo === position > 0` and
   * `canRedo === position < length`.
   */
  readonly position: number;
  readonly length: number;

  /** Tag the current position with a name. Re-tagging an existing name moves it. */
  checkpoint(name: string): void;
  hasCheckpoint(name: string): boolean;
  /** Jump to a checkpoint. Throws if the name is unknown or was pruned. */
  revertTo(name: string): void;

  /** Drop all entries and checkpoints; reset the cursor to 0. */
  clear(): void;
  /**
   * Subscribe to history changes for UI binding; the listener reads its own
   * application state. Returns an unsubscribe function.
   */
  subscribe(listener: (meta: HistoryMeta) => void): () => void;
}

export interface HistoryOptions {
  /**
   * Cap on retained entries. When exceeded, the oldest entries are evicted
   * (observable through `length`/`canUndo`). Must be a positive integer.
   */
  limit?: number;
}
