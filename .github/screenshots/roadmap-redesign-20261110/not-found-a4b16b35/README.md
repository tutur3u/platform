# Branded not-found and error page — a4b16b35

Shared `StatusPage` from `@tuturuuu/ui/custom/status-page`, captured at
`a4b16b352c0479b49cf7c5b239acc6ecc53ba31d` (branch `feat/branded-not-found-20261111`)
with headless Chrome emulating `prefers-color-scheme` (390 px at 2x, 1440 px at 1x).

- `roadmap-*`: the built roadmap Worker (`build:cloudflare`, run locally with
  the pre-seal doctor's Miniflare harness). `roadmap-not-found-*` is the router
  404 at `/roadmap/does-not-exist` and `/roadmap/vi/does-not-exist`;
  `roadmap-worker-boundary-404-*` is the Worker's own 404 for paths outside
  `/roadmap` (`/other`, `/vi/other`). All return HTTP 404.
- `web-*`, `tasks-*`, `calendar-*`: each app's own `[locale]/not-found.tsx` and
  `[locale]/error.tsx`, server-rendered with `react-dom/server`. Their dev
  servers need Supabase and redirect signed-out visitors to login.
- `web-not-found-en-classdark-on-light-system-1440.png`: `.dark` on `<html>`
  under a light system preference (theme class wins, no script).
- `stress-long-app-name-vi-light-390.png`: longest app name in Vietnamese at 390.

Matrix: {web, tasks, calendar, roadmap} x {en, vi} x {light, dark} x {390, 1440}
not-found, plus error pages (en, light/dark, 1440) for web, tasks and calendar.
