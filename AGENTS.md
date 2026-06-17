# @b2m9/reversible — agent guide

`@b2m9/reversible` is a headless, synchronous undo/redo engine that stores
inverse operations (`do`/`undo`), not snapshots, and never owns your state. The
public contract is in `src/types.ts` (JSDoc) and the model is explained in
`README.md` — read those first. This file lists only what those don't: the
constraints the compiler won't enforce, and how we make changes here.

## Toolchain

ESM-only, Node ≥22. Toolchain is Vite+ (`vp`), not plain npm:
`vp check` (format/lint/types), `vp test run`, `vp pack` (build).

## Constraints to preserve

- **Zero runtime dependencies.** The core ships only its own code.
- **Synchronous only.** `do`, `undo`, and the transaction builder must not
  return thenables — the engine throws if they do.
- **Headless.** The engine runs callbacks and moves a cursor; it never reads or
  writes application state.
- **No reentrancy.** Public mutations throw if called from inside a
  `do`/`undo`/rollback (`assertIdle`).
- **Notify only on real change.** A failed `commit`, an empty `transaction`, and
  a no-op `undo`/`redo`/`jump` notify _nobody_.
- **Checkpoints anchor to entries.** Pruned when their entry is evicted (`limit`
  overflow) or dropped (redo branch truncated by a fresh commit); `revertTo`
  throws on an unknown/pruned name.
- **Rollback is reverse-order and best-effort.** A throwing inverse stops
  rollback and surfaces.

## Design principles

This library's value is what it _doesn't_ do. Hold the line:

- Prefer removing code to adding it. A new option, parameter, or branch must
  earn its place — if a behavior composes from existing primitives, don't add a
  primitive for it.
- Every public API entry is a lifetime maintenance cost. Default to "no"; make
  the use case prove the surface is necessary.
- A feature change that only adds public surface area is suspect. When
  proposing one, say what it lets us delete or simplify.

## Comments

Match the comments already in `src/` — they are the style guide. The pattern:

- Explain _why_, not _what_: the invariant being held or the failure being
  guarded, never a paraphrase of the code below.
- Only at decision points — a guard, a non-obvious ordering, a deliberate
  no-op. Self-evident lines get nothing.
- Terse, full sentences, present tense. When in doubt, imitate the nearest
  existing comment.
