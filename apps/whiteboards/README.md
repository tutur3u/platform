# Whiteboards

Dedicated Whiteboards app, served at `tuturuuu.com/whiteboards`. It runs on
TanStack Start, Vite+ and Void behind `@tuturuuu/start-bridge`.

- Pages: `src/app/[locale]/(dashboard)/[wsId]` (board list) and `[boardId]` (editor).
- UI: `src/features/whiteboards`; the canvas is `@tuturuuu/whiteboard`.
- Data: boards, snapshots and images stay behind Web's
  `/api/v1/workspaces/<id>/whiteboards` routes, reached through
  `@tuturuuu/internal-api/whiteboards`.
- Runbook: `apps/docs/build/devops/whiteboards-start-void.mdx`.

```bash
bun dev:app           # Next dev server on port 7837 (portless: whiteboards.tuturuuu)
bun run routes:check  # bridge route registries are current
```

Builds run in CI, not on a shared development machine.
