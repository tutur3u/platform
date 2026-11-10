# Privacy

## Sub-features

The Privacy Policy heading, the summary heading `Privacy at a glance`, and the effective date `August 15, 2026`.

## How to get to it (user POV)

Open `/en/privacy`. The document is public and does not ask for an account.

## Driving it

From `apps/web`, with Doctor's server and the local `BASE_URL`:

```bash
bunx playwright test e2e/public-marketing-routes.noauth.spec.ts \
  --project=chromium-no-auth \
  --grep "renders legal route /en/privacy" \
  --timeout=180000
```

Unset cloud database URLs the same way as the Tasks drive. The page reads the legal package, not a user record.

## Proof

HTTP OK, heading `Privacy Policy`, summary heading `Privacy at a glance`, and the text `Effective August 15, 2026`.

## Charters

- Open `/en/privacy` and confirm the policy title and the at-a-glance summary are both on the page.
- Confirm an anonymous visit is not redirected to login.

## Gotchas

Copy comes from `@tuturuuu/legal` through `getLegalDocument('privacy', locale)`, not from `messages/en.json`. A date change in the legal package fails this spec until the spec's expected date is updated with it.
