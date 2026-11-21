# Mounted shared-session authentication

On `https://tuturuuu.com`, the mount adapter supplies only the shared Supabase
access token and drops `sb-*` response writes. The mount has no refresh token.
Route auth by both the exact apex origin and the app's recognized `basePath`;
subdomain requests retain their existing app-session policy.

Use `apps/tasks/src/lib/mounted-auth.ts` as the page-auth reference:

- Read with `resolveMountedSharedSession` behind `withAppLogoutFence`.
- Complete verify-token with `consumeMountedSharedSession`, `supabase-only`,
  `app-relative` next URLs, and Web's apex origin.
- Send missing/expired sessions to Web login, returning through the active
  mount's verify-token callback. Preserve query strings inside its next URL.
- Send MFA challenges to Web with `mfa=required`; fail closed through
  `mountedSessionFailureResponse` when account assurance is unavailable.
- Use the mounted resolver for cookie-authenticated API requests instead of
  refreshing. Preserve existing local-auth, public identity, and verified bearer
  exceptions and API guards.

Learn recognizes both `/learn` and `/lms/learn`; construct its callback from the
active request base. Keep invite redirects under its no-referrer policy.

Run each app's `src/lib/mounted-auth.test.ts`, `src/proxy-mounted.test.ts`, and
existing proxy tests without building dependencies locally. Cover successful and
expired page/API sessions, verify-token delegation, exact origin/base routing,
MFA/assurance failures, aliases, and subdomain refresh. Local fixture tests do not
replace independent security review or exact-commit CI/emitted-Worker acceptance.
