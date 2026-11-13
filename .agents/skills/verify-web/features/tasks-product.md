# Tasks product

## Sub-features

Marketing page for Tasks: the heading `Work that stays where you left it`, the `Open Tasks` link, and `Talk to us`.

## How to get to it (user POV)

Open `/en/products/tasks`. The page is public. `Open Tasks` points at the Tasks app (`https://tasks.tuturuuu.com` in the page config), which is a different process from `apps/web`.

## Driving it

From `apps/web`, after Doctor is up:

```bash
env -u DATABASE_URL -u DIRECT_URL -u POSTGRES_URL -u SUPABASE_URL -u SUPABASE_SERVER_URL \
  BASE_URL=http://127.0.0.1:7803 \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001 \
  bunx playwright test e2e/public-marketing-routes.noauth.spec.ts \
  --project=chromium-no-auth \
  --grep "renders product route /en/products/tasks" \
  --timeout=180000
```

The spec is a GET. It does not create tasks.

## Proof

The response is OK, the heading is visible, and both `Open Tasks` and `Talk to us` are links. No runtime error text from `e2e/helpers/public-routes.ts`.

## Charters

- Open `/en/products/tasks` and confirm the heading is about work staying where you left it, with an `Open Tasks` link.
- Confirm the page does not bounce an anonymous visitor to `/login`.

## Gotchas

The product route is covered as one case inside `public-marketing-routes.noauth.spec.ts`. Grep for the path so the rest of that file (legal pages, redirects, every other product) does not run. Clicking `Open Tasks` leaves `apps/web`.
