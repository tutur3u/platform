Landing first paint uses a hashed external critical stylesheet; the remaining rules load non-blocking after the initial load, with a complete no-JavaScript fallback. The HTML and serialized RSC stylesheet identities stay consistent. Initial module-preload hints yield to the poster/CSS; the normal module bootstrap remains. The poster and browser chrome render on the server; only playback controls hydrate. Consent UI loads only when enabled, notifications load lazily, and the shared navbar theme control uses a native button/SVG instead of the slot/variant graph. EN/VI copy, logo geometry and design remain intact.

Head `82e2c9d1df455414b2deb8e945f3d7e3e51975c2`; base `5f510d6db991bd3792e697cc2ee3ff7d543295a1`. 22 files changed, 480 insertions(+), 99 deletions(-).

CSP: No directive changes, unsafe-inline, inline styles/scripts or inline load handlers added. External hashed CSS; existing scripts/nonces preserved. Built root CSP remains frame-ancestors none. No bridge package or protected Worker/SEO/runtime configuration was edited.

Lighthouse 12.8.2 mobile defaults, median of 3; both sides are fresh production Worker builds through the same gzip-only local proxy. JS is transferred KiB. INP is the 4× CPU interaction proxy, not field INP.

| URL | Stage | Score | LCP (s) | TBT (ms) | CLS | INP proxy (ms) | JS KiB |
|---|---|---:|---:|---:|---:|---:|---:|
| `/` | before | 84 | 3.468 | 0 | 0 | 40 | 211.2 |
| `/` | final | 93 | 2.987 | 0 | 0 | 40 | 180.5 |
| `/vi` | before | 83 | 3.613 | 0 | 0 | 48 | 211.2 |
| `/vi` | final | 91 | 3.066 | 0 | 0 | 40 | 180.5 |

Lighthouse score and interaction targets pass; the LCP target remains unmet. Both locales beat the 84/83 and 3.46/3.61s floor. Initial script requests fall from 32 to 20; JS transfer falls about 14.6%. Blocking CSS falls to 16.8KiB, with about 156ms blocking duration in the final report.

All heavy checks ran through `$HOME/ci/tools/ttr-admit`, with the pinned Node 24.22.3 / Bun 1.4.4 directory first on PATH and GitHub token variables removed. `bun x` invokes the pinned Bun directly where `bunx` is absent from that directory.

| Gate | Exit | Counts / result |
|---|---:|---|
| `bun install --frozen-lockfile` | 0 | 2760 installs across 3078 packages; unchanged lockfile |
| `bun x oxlint <16 changed JS/TS files>` | 0 | 16 changed JS/TS files; 0 errors/warnings |
| `bun x oxfmt --check .` | 0 | 21,586 files; 0 failures |
| `npx --yes stylelint@16 --config <no-duplicate-selectors config> <changed landing.css>` | 0 | 1 authored CSS file; 0 duplicate selectors |
| `node scripts/check-source-size.js` | 0 | 47 authored sources in default comparison; 0 violations |
| `node scripts/ci/wrangler-usage.js` | 0 | inventory completed |
| `node scripts/generate-docs-inventory.js --check` | 0 | 0 stale; 3 generated dependency inventories updated |
| `node scripts/generate-app-seo.js --check` | 0 | 0 stale |
| `(cd apps/marketing && bun run type-check)` | 0 | base 0 / head 0 / new 0 errors |
| `(cd packages/marketing-shell && bun run type-check)` | 0 | base 0 / head 0 / new 0 errors |
| `(cd apps/roadmap && bun run type-check)` | 0 | base 0 / head 0 / new 0 errors |
| `(cd apps/marketing && bun run test)` | 0 | 11 files; 51 passed, 0 failed |
| `(cd packages/marketing-shell && bun run test)` | 0 | 1 file; 5 passed, 0 failed |
| `node --test --test-concurrency=2 apps/roadmap/src/roadmap-data.test.ts apps/roadmap/src/cache-policy.test.ts apps/roadmap/scripts/seal-artifact.test.mjs apps/roadmap/scripts/pre-seal-doctor.test.mjs` | 0 | 241 tests; 238 passed, 3 skipped, 0 failed; 50 suites |
| `(cd apps/marketing && bun run build:cloudflare)` | 0 | production Worker build passed; sealed build repeated at exact head |
| `bun check:changed` | 0 | 22 changed files; 17 steps passed |
| `(cd apps/roadmap && ROADMAP_OFFLINE=1 ROADMAP_SOURCE_SHA=$(git rev-parse HEAD) bun run build:cloudflare)` | 0 | exact-head build passed |
| `ROADMAP_SOURCE_SHA=$(git rev-parse HEAD) node apps/roadmap/scripts/pre-seal-doctor.mjs` | 0 | exact-head doctor and negative fixture passed |
| `node <four-public-document inline-script probe>` | 0 | 4 inline scripts on each of 4 public documents |
| `node scripts/check-source-size.js --base 5f510d6db991bd3792e697cc2ee3ff7d543295a1` | 0 | 15 changed authored sources; 0 violations |

Type checks: zero new errors against the exact base in marketing, marketing-shell and roadmap. The exact-head roadmap build/doctor passes; `/roadmap`, `/roadmap/vi` and both workshop documents each have exactly four inline scripts. The CSS substring regression test was observed failing (1/5) before the exact-candidate scanner and passes 5/5 after it.

[Screenshots, raw reports and receipt](https://github.com/tutur3u/platform/tree/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/landing-critical-82e2c9d1): `/`, `/vi`, `/roadmap` × 390/1440 CSS px × light/dark (12 PNGs). The critical-only vs complete CSS probe compared 383 visible elements across EN/VI, mobile/desktop and both themes: zero computed-style differences. Mobile menus open/close and restore focus in both apps; video playback reveals the iframe and hides its decorations; theme and language changes are confirmed.

Resolved tools: `/Users/thanhpham/tools/pinned-24.22.3-1.4.4/bin/node` and `/Users/thanhpham/tools/pinned-24.22.3-1.4.4/bin/bun`; hooks `.githooks`. The only shared runtime change is the native theme control in marketing-shell; its existing props/API remain unchanged. Three generated dependency inventory files reflect the two build-only dependencies.

- Lighthouse >=90 and INP proxy <200ms pass; LCP <2.5s remains unmet. Non-regression floor passes on both locales.
- LCP poster simulated render delay remains 2.13s EN / 2.21s VI (71% / 72%); image load itself is 152 / 123ms in representative reports.
- Framework entry still has about 48KiB unused JS (Lighthouse estimates 300ms savings). Next cut needs Start/RSC hydration/entry architecture beyond the local UI islands.
- Blocking CSS is 16.8KiB vs 35.6KiB; total CSS is about 40.1KiB due split cascade scaffolding. HTML is buffered for the landing-only resource-identity rewrite; other routes keep their original response.
- Local gzip buffering differs from Cloudflare Brotli, streaming, caching and network distance; no field-CWV claim.
- Protected worker.ts, SEO policy, void.config.ts and native-built-worker.runtime.mjs are unchanged.

Author: `vhpx <contact@vohoangphuc.com>`; no trailers.
