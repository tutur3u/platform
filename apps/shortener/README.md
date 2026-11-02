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

## Redirect contract coverage

`src/native/shortener-request.test.ts` exercises request dispatch with in-memory
link rows and fake page, API, and asset handlers. It covers exact case-sensitive
slug lookup, missing and invalid destinations, password pages, click recording,
redirect status and destination, cache/security headers, HEAD behavior, malformed
paths, and alias query preservation. `src/link/link.test.ts` covers destination
validation, analytics metadata, password verification, and analytics write
failures. These tests make no network or production requests. Keep this contract
suite green when changing the runtime adapter or redirect implementation.

## Environment

`env.example` is the tracked placeholder template. For local development, copy
it to `.env` and fill the required values privately. Keep `.env` out of Git.
Void supports one local `.env` file and rejects `.env.example` and other dotenv
variants; the non-dot template is not loaded as configuration.

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
