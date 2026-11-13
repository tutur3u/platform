# Landing

## Sub-features

The English hero (`Your Team.` / `One Workspace.`), the primary link to `/login`, and the bento heading `One workspace. Every part of the job.`

## How to get to it (user POV)

Open the site root. English is `/en`. The first screen is the hero, with `Get Started Free` and `Explore the workspace`.

## Driving it

Doctor already fetches `/en`. To use the harness, from `apps/web` with `BASE_URL=http://127.0.0.1:7803` and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001`:

```bash
bunx playwright test e2e/public-marketing-routes.noauth.spec.ts \
  --project=chromium-no-auth \
  --grep "renders landing route /en" \
  --timeout=180000
```

The spec expects an `h1` matching `Your Team.` and `One Workspace.`, then the bento heading.

## Proof

HTTP 200 from `/en` and the visible `h1`. The same spec covers `/` unless `DOCKER_WEB_FRONTEND=tanstack`, which this Next app is not.

## Charters

- Scroll the landing page and confirm the hero headline stays the two lines `Your Team.` and `One Workspace.`
- Follow `Get Started Free` and confirm the browser lands on the login form.

## Gotchas

The hero copy lives in `apps/web/messages/en.json` under `landing.hero.title`. Changing `line1` makes Doctor fail. Vietnamese copy is a different string under `/vi`.
