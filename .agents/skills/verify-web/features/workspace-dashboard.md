# Workspace dashboard

## Sub-features

The signed-in workspace home at the seeded route `/en/personal`, including the sidebar that `e2e/navigation.spec.ts` wanted to click through.

## How to get to it (user POV)

Sign in with the local seed account named in `apps/web/e2e/helpers/constants.ts`, then open the personal workspace. The address is `/en/personal`. Production accounts are out of scope. Do not use them.

## Driving it

Do not drive this row unless local Supabase is up on `127.0.0.1:8001` and you accept that `e2e/auth.setup.ts` logs the seed user in and writes `apps/web/e2e/.auth/user.json`.

```bash
bunx playwright test e2e/dashboard.spec.ts --project=chromium --timeout=180000
```

The navigation spec will not count as proof while it is `test.fixme`.

## Proof

There is no current user-level proof. `dashboard.spec.ts` only asserts that an authenticated session leaves `/login` and that the document title is non-empty. The sidebar assertion is disabled.

## Charters

- After a local seed login, open `/en/personal` and confirm the workspace shell is visible.
- Use the sidebar to open a second workspace page and confirm the path changes.

## Gotchas

`TEST_WORKSPACE_ROUTE` is `personal` so the test stays on a web-owned route. The fixme says that seed account no longer has a stable workspace shell. Treat this feature as untested until that spec runs without `fixme`. Docker and local Supabase were not assumed to be running.
