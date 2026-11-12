The reserved-staging-names control also reproduces the original Bun virtual-import failure. Both added gates pass at the fixed head:

| Command | Exit | Result |
|---|---:|---|
| `node --test scripts/ci/reserved-staging-names.test.mjs` | 0 | 2 passed, 0 failed |
| `bun --eval "await import('./apps/marketing/start-bridge.config.ts')"` | 0 | Imported without Vite |

Native qualification fix at `9581f25cc43b8e314651f6ff602ef9a71df18224` (fast-forward from `82e2c9d1df455414b2deb8e945f3d7e3e51975c2`).

The native gate imports `start-bridge.config.ts` directly through Node. Vite-only virtual module resolution did not apply there. The config imports a real JSON module; the build transforms its JSON contents to the emitted stylesheet mapping, so the Worker still embeds the build-time URLs. The local helper uses an explicit `.ts` extension for Node's native type stripping.

Security properties remain unchanged: GET + 200 + text/html on `/`, `/en`, `/vi` only; `secure()` after the rewrite; nonce preservation; `data-href` from the build mapping. No CSP relaxation or protected Worker/SEO/runtime edits.

CI's native build plus `test:runtime` were reproduced with `CI=true`, `TUTURUUU_NOINDEX=1`, `NEXT_PUBLIC_APP_URL=https://marketing.tuturuuu.com`, `NEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com`, public Supabase fixtures and `CI_SOURCE_SHA` set to the tested head. GitHub token variables were removed.

- Before: exit **1**, 0 passed / 1 failed, `ERR_UNSUPPORTED_ESM_URL_SCHEME` (`virtual:`).
- After: exact-head native build and `test:runtime` exit **0**, **9 passed / 0 failed**.
- Regression: emitted-module scan, broken static/re-export/dynamic imports, nonempty build mapping embedded in output, and direct Node config import.
- Full gate: marketing 51 tests; shell 5; roadmap 238 passed / 3 skipped; all three type checks zero errors; lint/format/stylelint, source-size, inventory/SEO, builds, roadmap doctor and `check:changed` pass. Four inline scripts on each roadmap document.
- Quick Lighthouse `/`: **93**, LCP **2.962s**, TBT **0ms**, CLS **0**. Single check, same local production Worker/gzip method; LCP <2.5s remains unmet.

[Native qualification logs, regression evidence and quick Lighthouse](https://github.com/tutur3u/platform/tree/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/landing-critical-82e2c9d1/native-fix-9581f25c).

