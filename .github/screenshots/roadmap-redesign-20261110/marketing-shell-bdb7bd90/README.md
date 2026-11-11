Marketing uses the shared navigation/footer with a server-rendered wordmark, small client controls, first-use mobile navigation, constrained-device motion, responsive WebP LCP assets and EN/VI font subsets. The old navigation deletions are preserved. Vietnamese gradient-text descenders remain visible. The shared shell keeps its existing roadmap API.

Head `bdb7bd904f61f9c8e914fe6671b01070a6908042`; rebased base `33069539b7a181cd74542ac6d53b9f80d34de92b`. Diff: 73 files changed, 1015 insertions(+), 1763 deletions(-).

| #8188 gain | Destination / disposition |
|---|---|
| Server wordmark; no routing-hook suspense | Shared navbar.tsx + async marketing-frame.tsx; routing hooks confined to marketing-controls.tsx. |
| Named mobile navigation and video control | nav-actions.tsx and mobile-menu.tsx retain localized trigger/Sheet names; video-hero.tsx retains the visible watch text in playLabel. |
| First-use mobile island | nav-actions.tsx loads mobile-menu.tsx only on click; the loaded Sheet opens immediately. |
| Native desktop dropdown; closed panels hidden | Shared nav-dropdown.tsx uses CSS, click/Escape, hidden panels and no Framer dependency. |
| Plain SVG icon graph and licence | Shared static-icons.tsx/LICENSE; app reexports the subpath; products/navigation/nav-menu render server-side. |
| No global query provider | Marketing layout omits QueryProvider; pricing-island.tsx and the contact-local provider retain their own graph. |
| Trimmed client translations | ROOT_CLIENT_MESSAGE_PATHS retained; marketing-render-context.ts sends only landing/commercialComparison plus shared paths on EN/VI roots. Other routes retain full sets. |
| Deferred bento/demo/AI/pricing/stats/CTA; hash links | deferred-landing-sections.tsx and HashScroll retained; problem/payoff also wait for viewport proximity. |
| Immediate hero/reveal and click-to-load video | rise.ts, reveal.tsx, hero/video files retained; video-player.tsx adds matching responsive WebP/preload assets. |
| Constrained-device motion and timers | Shared use-static-motion.ts; app alias preserves all demo/AI/pricing/count-up/hero consumers and tests. Shared shell disables backdrop blur and dropdown resize motion on constrained devices. |
| Static paint and manual marquee | landing.css, manual product-marquee.tsx, trust-badge contrast, demo/AI timer guards retained unchanged. |
| One stylesheet identity | Main's start-bridge page-render.tsx normalization retained unchanged; shared fonts and landing CSS co-located with root globals.css. One stylesheet request, no crossorigin mismatch. |
| App-scoped CSS graph | marketing-css.mjs includes shared-shell transitive UI imports; scanner test covers them. Vite plugin retained. |
| Font assets and deleted app files | Duplicate app font setup removed; shared OFL faces retained, mono EN/VI subsets added with full-glyph fallback and small static 400 faces. Deleted navigation gains are all mapped above; no performance gain discarded. |

Lighthouse 12.8.2 mobile, median of three. Before = sealed #8188; after = this production Worker. Both use the same gzip-only local proxy. JS is transferred KiB. INP is the 4× CPU interaction proxy, not field INP.

| URL | Stage | Score | LCP (s) | TBT (ms) | CLS | INP proxy (ms) | JS (KiB) |
|---|---|---:|---:|---:|---:|---:|---:|
| `/` | Before | 84 | 3.642 | 0 | 0 | <16 | 229.8 |
| `/` | After | 84 | 3.464 | 0 | 0 | 48 | 209.8 |
| `/vi` | Before | 82 | 3.791 | 0 | 0 | 48 | 229.8 |
| `/vi` | After | 83 | 3.613 | 0 | 0 | 40 | 209.8 |

All gate commands ran without GitHub tokens. Final gates use Node 24.22.2 / Bun 1.4.4; a preliminary Node 22 test invocation required type stripping, so the final roadmap gate was repeated with CI's Node 24.

| Gate command | Exit | Counts / result |
|---|---:|---|
| `bun install --frozen-lockfile` | 0 | 2759 installs across 3077 packages checked; lockfile unchanged |
| `bunx oxlint <37 changed JS/TS files>` | 0 | 37 JS/TS files; 0 errors, 0 warnings |
| `bunx oxfmt --check .` | 0 | 21,513 files; 0 formatting failures |
| `npx --yes stylelint@16 --config <temp no-duplicate-selectors config> <2 changed CSS files>` | 0 | 2 CSS files; 0 duplicate selectors |
| `node scripts/check-source-size.js` | 0 | 38 changed authored sources; 0 violations above 700 lines |
| `node scripts/ci/wrangler-usage.js` | 0 | 320 files inventoried (20 config, 41 manifests, 121 scripts, 99 source, 39 workflows) |
| `node scripts/generate-docs-inventory.js --check` | 0 | 0 stale; 4 generated inventory files refreshed |
| `node scripts/generate-app-seo.js --check` | 0 | 0 stale |
| `(cd apps/marketing && bun run type-check)` | 0 | 0 errors |
| `(cd packages/marketing-shell && bun run type-check)` | 0 | 0 errors |
| `(cd apps/roadmap && bun run type-check)` | 0 | 0 errors |
| `(cd apps/marketing && bun run test)` | 0 | 9 files, 45 passed, 0 failed |
| `(cd packages/marketing-shell && bun run test)` | 0 | 1 file, 5 passed, 0 failed |
| `node --test apps/roadmap/src/roadmap-data.test.ts apps/roadmap/src/cache-policy.test.ts apps/roadmap/scripts/seal-artifact.test.mjs apps/roadmap/scripts/pre-seal-doctor.test.mjs` | 0 | 222 tests: 219 passed, 3 skipped, 0 failed; 43 suites |
| `(cd apps/marketing && bun run build:cloudflare)` | 0 | production Worker build succeeded |
| `bun check:changed` | 0 | 19 steps passed; 0 failures |
| `(cd apps/roadmap && ROADMAP_OFFLINE=1 ROADMAP_SOURCE_SHA=$(git rev-parse HEAD) bun run build:cloudflare)` | 0 | passed at bdb7bd904f61f9c8e914fe6671b01070a6908042 |
| `ROADMAP_SOURCE_SHA=$(git rev-parse HEAD) node apps/roadmap/scripts/pre-seal-doctor.mjs` | 0 | passed at bdb7bd904f61f9c8e914fe6671b01070a6908042 |

Type-check comparison against `origin/main`: marketing 0→0, marketing-shell 0→0, roadmap 0→0; **zero new errors**. The roadmap doctor passes at the exact head, including four public documents, canonical/asset/font/CSP checks, and rejection of the deliberately broken D79 fixture.

[Screenshots and full evidence](https://github.com/tutur3u/platform/tree/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90) — `/`, `/vi`, `/roadmap` × 390/1440 CSS px × light/dark (12 PNGs), raw before/after Lighthouse JSON, gate logs and receipt.

| Page | 390 light | 390 dark | 1440 light | 1440 dark |
|---|---|---|---|---|
| en | [390 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/en-light-390.png) | [390 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/en-dark-390.png) | [1440 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/en-light-1440.png) | [1440 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/en-dark-1440.png) |
| vi | [390 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/vi-light-390.png) | [390 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/vi-dark-390.png) | [1440 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/vi-light-1440.png) | [1440 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/vi-dark-1440.png) |
| roadmap | [390 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/roadmap-light-390.png) | [390 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/roadmap-dark-390.png) | [1440 light](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/roadmap-light-1440.png) | [1440 dark](https://github.com/tutur3u/platform/blob/screenshots/roadmap-redesign-20261110/.github/screenshots/roadmap-redesign-20261110/marketing-shell-bdb7bd90/roadmap-dark-1440.png) |

The initial script count drops from 44 in #8188 to 31; transferred JS drops 8.7%. EN document transfer drops from 58.4 to 47.7 KiB; VI from 77.4 to 73.3 KiB. Shared Be Vietnam Pro fonts are active; the normal mono Latin face is 19.4 KiB, with the full font retained as a glyph fallback. The shared UI change is a two-line Tailwind `@source` declaration so every shell host emits its classes; no tokens or component behavior change. Four generated docs inventory files reflect the dependencies/exports.

- Score >=90 and LCP <2.5s remain unmet; the 84/82 and 3.64/3.79s floor passes. INP proxy <200ms passes.
- LCP is the responsive video poster in both locales. Representative simulated render delay is 2.44s EN / 2.70s VI (70% / 75% of LCP); image load itself is about 126 / 135ms.
- One 35.6KiB gzip stylesheet blocks for about 1.36s; Lighthouse estimates 450ms savings. The 111KiB gzip framework entry contains about 51KiB unused JS (400ms estimated LCP savings).
- Next cut: route-level critical CSS plus progressive Start/RSC resource delivery and framework entry splitting; preserve the fully styled first paint and EN/VI typography.
- Production noindex/indexing is outside scope, owned by PR #8178/release policy; protected worker, SEO policy, Void config and native runtime files are unchanged.

Commit authors and bodies (`git log --format='%an <%ae>%n%b' origin/main..HEAD`):

```text
vhpx <contact@vohoangphuc.com>

vhpx <contact@vohoangphuc.com>
Render marketing routes with the shared navigation, footer and self-hosted
fonts. Remove the duplicate navigation cluster and source the shared shell
classes for every host app.
```

Both commits are authored by `vhpx <contact@vohoangphuc.com>` and contain no trailers.
