# apps/web features to verify

Public routes below render without a signed-in session. The workspace dashboard does not.

| Feature | Route | Test file | Status |
| --- | --- | --- | --- |
| Landing | `/` and `/en` | `apps/web/e2e/public-marketing-routes.noauth.spec.ts` | tested |
| Login | `/en/login` | `apps/web/e2e/auth.noauth.spec.ts` | tested |
| Tasks product | `/en/products/tasks` | `apps/web/e2e/public-marketing-routes.noauth.spec.ts` | tested |
| Privacy | `/en/privacy` | `apps/web/e2e/public-marketing-routes.noauth.spec.ts` | tested |
| Workspace dashboard | `/en/personal` | `apps/web/e2e/dashboard.spec.ts` | untested |

`untested` means the harness does not currently prove the page a signed-in user sees. `e2e/navigation.spec.ts` marks the shell checks `test.fixme`. `dashboard.spec.ts` still needs `e2e/auth.setup.ts` and local Supabase, which this skill does not start.

Doctor's landmark is the Landing hero. Drive a different row when you want a second observation.
