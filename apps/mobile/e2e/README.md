# Mobile E2E pilot

Run these commands from this directory with Node 24 and Bun 1.4.4.

```sh
bun install --frozen-lockfile
node --test shared-mobile-config.test.mjs
npx --no-install tsc --noEmit
npx --no-install e2e list
```

Discovery lists both platforms without starting a simulator. The report-only
workflow can replay against a supplied dev or staging app artifact. Strict
replay requires recordings for the target and app state. Record only on a
simulator or emulator running a real app artifact. Keep the cache empty until
there are recordings to review for sensitive data.

Use a disposable QA session supplied through
`E2E_SECRET_MOBILE_ACCESS_TOKEN` and `E2E_SECRET_MOBILE_REFRESH_TOKEN`. Start
in a QA workspace that exposes all pilot apps. Seed a timed event on the
current day, at least one task in the first visible board with zero Urgent
tasks, and a visible contact whose name, email, and phone do not match
`tuturuuu-e2e-no-match`. The board must allow task creation and the account
must be able to open the Contacts directory and Reports. Use synthetic records
throughout the workspace. The suites open editors and dismiss them without
saving.
