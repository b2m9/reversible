# @b2m9/reversible

Headless, framework-agnostic undo/redo for any state. You give it reversible
operations; it gives you `undo`/`redo`/`jump` traversal, grouped transactions,
checkpoints, and timeline scrubbing. It does **not** own your state, but composes
with whatever store you already have.

```bash
npm install @b2m9/reversible
```

ESM-only. Zero runtime dependencies.

## The model: command, not snapshot

Most undo libraries snapshot your whole state into a `past`/`future` stack.
`reversible` stores **inverse operations** instead. You `commit` a `do`/`undo`
pair; the engine runs `do` and remembers how to reverse it.

|                        | Snapshot-based                      | **@b2m9/reversible**                        |
| ---------------------- | ----------------------------------- | ------------------------------------------- |
| Coupling               | Higher-order reducer / store plugin | Headless, zero-dep, any store or none       |
| History model          | Full copies of `present`            | Inverse operations (`do`/`undo`)            |
| Memory cost            | State size × history depth          | Inverse-payload size — usually ≪ a snapshot |
| Non-serializable state | Effectively unsupported             | Supported — you write the inverse           |
| Grouping               | Auto-capture heuristics             | Explicit `transaction()` boundary           |
| What's undoable        | Filter config                       | Caller decides — just don't `commit()` it   |

The engine holds one ordered list of entries and a **cursor**:

```
   committed entries
   ┌──────┬──────┬──────┐           ┌──────┐
   │  e1  │  e2  │  e3  │   cursor  │  e4  │
   └──────┴──────┴──────┘     ▲     └──────┘
          undoable           here   redoable
```

Everything left of the cursor can be undone; everything right can be redone.
"Present state" is **your app's**, not the engine's and it only knows how to move
along the timeline of effects.

> **The one responsibility you own:** `do` and `undo` must be true inverses.
> The engine keeps its own bookkeeping consistent; it cannot fix a broken inverse.

## One tiny example

The external `count` is the point: your state, wherever it lives.

```ts
import { createHistory } from "@b2m9/reversible";

const history = createHistory();
let count = 0;

history.commit({
  label: "increment",
  do: () => {
    count += 1;
  },
  undo: () => {
    count -= 1;
  },
});

history.undo(); // count === 0
history.redo(); // count === 1
history.jump(-1); // count === 0 — scrub the whole timeline
```

## One transaction example

Group many operations into one atomic entry — undone and redone as a unit.

```ts
history.transaction('type "hello"', (tx) => {
  for (const ch of "hello") {
    tx.commit({
      do: () => doc.append(ch),
      undo: () => doc.trimEnd(1),
    });
  }
});

history.undo(); // removes the whole word, not one letter
```

Wire it to UI with `subscribe`, which hands each listener a meta snapshot:

```ts
const off = history.subscribe((m) => {
  undoBtn.disabled = !m.canUndo;
  undoBtn.title = m.undoLabel ? `Undo: ${m.undoLabel}` : "Undo";
});
```

## Failure rules

- **Synchronous only.** `do`/`undo` must run synchronously. If one returns a
  thenable, the engine throws loudly rather than fire-and-forget a promise it
  can't reverse.
- **Atomic transactions (best-effort).** If anything throws before a
  `transaction` builder returns, the applied operations roll back in reverse and
  the entry never enters history. "Best-effort" because atomicity holds only as
  far as your inverses allow.
- **Failed `commit` is a no-op.** If `do` throws, nothing is recorded, the cursor
  doesn't move, and the redo branch is left intact.
- **Boundaries clamp.** `undo()`/`redo()` return `false` at the ends. `jump(n)`
  clamps and returns the signed count of steps actually moved (`jump(n) === n`
  means fully moved). A throw mid-`jump` stops at the last successful step.
- **A new commit after undo clears the redo branch.** Traversal never does.
- **Reentrancy throws.** Calling back into the engine from inside a running
  `do`/`undo`/rollback throws. `subscribe` listeners fire after the operation
  settles, so calling back from a listener is fine.

## API

```ts
const history = createHistory({ limit: 100 }); // limit is optional

history.commit({ label?, do, undo });
history.transaction(label, (tx) => tx.commit({ do, undo }));

history.undo();    // boolean
history.redo();    // boolean
history.jump(n);   // signed steps moved

history.canUndo;   // booleans / derived meta
history.canRedo;
history.undoLabel; // string | undefined
history.redoLabel;
history.position;  // cursor in [0, length]
history.length;

history.checkpoint(name);
history.hasCheckpoint(name); // gate revertTo the way canUndo gates undo
history.revertTo(name);      // throws if the name is unknown or was pruned

history.clear();
history.subscribe((meta) => { /* ... */ }); // returns unsubscribe
```

With `limit`, the oldest entries are evicted past the cap. Checkpoints anchor to
the entry they sit after, so they stay correct as eviction renumbers positions; a
checkpoint whose anchor is evicted (or dropped when a commit clears a redo branch)
is pruned, and `revertTo` on it throws.

## Non-goals

- **It doesn't own your state.** No `present`, no store, no deep-clone. A thin
  state-owning convenience wrapper may land later, layered on top.
- **No async.** Reversing remote or async effects is a compensation-and-idempotency
  problem this package deliberately does not solve.
- **No branching timelines.** Checkpoints are markers on one line, not forks.

## License

MIT © 2026 Bob Massarczyk
