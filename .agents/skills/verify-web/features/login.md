# Login

## Sub-features

Email field, Continue submit button, Continue with passkey, and Continue with Google. OTP and password stages exist behind the email continue action.

## How to get to it (user POV)

From the landing hero, choose `Get Started Free`, or open `/en/login`. The form asks for an email or username before any other step.

## Driving it

The render smoke is unauthenticated. Its `beforeEach` resets local rate-limit rows, so local Supabase must be listening on `127.0.0.1:8001`. Skip this spec when that port is closed. From `apps/web`:

```bash
bunx playwright test e2e/auth.noauth.spec.ts \
  --project=chromium-no-auth \
  --grep "login page renders with email input" \
  --timeout=180000
```

Keep the same `BASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` as Doctor. A signed-in production login is manual. Do not type production credentials into it.

## Proof

The email placeholder `Enter your email or username` is visible, and the form's submit button reads Continue.

## Charters

- Load `/en/login` directly and confirm the email field is usable before any network call returns.
- Submit an empty email and confirm the page stays on the login form.

## Gotchas

`/login` is a cacheable auth shell in `apps/web/src/proxy.ts`. The OTP path reads local Supabase and Mailpit. This skill does not start either one.
