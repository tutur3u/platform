# Shortener (native Start + Void)

Shortener is the public redirect runtime for `ttr.gg` and its configured alias
domains. It runs on TanStack Start SSR, Vite+ and the official Void SDK with a
custom Worker entry. Production publication is held; the canonical domains keep
the last Vercel deployment until a reviewed cutover admits this app.

- `cloudflare/worker.ts` wires the request policy to Start, the Supabase store,
  `bcryptjs` and the retained API abuse guard.
- `src/native/shortener-request.ts` owns hosts, API ownership, static files,
  slug redirects and document methods.
- `src/link/` holds framework-free domain logic: resolution, destination
  validation, click analytics, password verification and host aliases.
- `src/routes/` renders only the password, not-found and invalid-destination
  pages from the model the Worker resolved.

`next.config.ts` and `src/i18n/` stay only for the repository SEO and next-intl
registries; they are not the active runtime.

## Commands

- `bun run dev` serves the Worker locally through Void on port 3002.
- `bun run test` runs the focused unit suite. Queue it locally with
  `ttr resources run -- bun run test`.
- `bun run build` and `bun run build:cloudflare` run `vp build`. Release builds
  run in CI only.
- `bun run test:runtime` exercises the emitted Worker. It requires `CI=true` and
  `CI_SOURCE_SHA` after the native CI build.

See `apps/docs/build/devops/shortener-start-void.mdx` for qualification,
cutover and rollback.
