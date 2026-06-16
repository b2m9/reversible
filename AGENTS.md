<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## About this package

`@b2m9/reversible` is a headless, framework-agnostic undo/redo engine. It stores
inverse operations (`do`/`undo`), not state snapshots, and does not own your
state. The engine is **synchronous** and its core has **zero runtime
dependencies**.

- `src/core.ts` — entry list, cursor, `commit`/`undo`/`redo`/`jump`, checkpoints,
  `clear`, `subscribe`, derived meta, and the reentrancy / synchronous guards.
- `src/transaction.ts` — the transaction builder and its rollback.
- `src/types.ts` — the public `Reversible`, `History`, `HistoryMeta` shapes.

The single normative source for failure/rollback/reentrancy behavior is the
package brief. The one invariant the caller owns: **`do` and `undo` must be true
inverses.**

Build the library with `vp pack`; run the test matrix with `vp test`.
