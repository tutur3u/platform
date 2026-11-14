# PR #8347 heavy gate evidence: Cloudflare logo + masonry (head cdc67251)

Independent verifier run, 2026-11-14 (UTC 00:44 to 04:30), base 502f6029.

## What was served
- Gate builds (`ROADMAP_OFFLINE=1 bun run build:cloudflare`) of head and base were used for the canonical smoke, CSP, Lighthouse and axe.
- The offline build writes every host as `unknown`, so it renders no Cloudflare Workers group and no logo. Screenshots and the logo checks therefore come from a second, online build of the same head (hosting probed: workers 14, vercel 13, unknown 3). Masonry CSS is identical in both builds.
- Server: `wrangler dev --local --compatibility-date 2026-07-30` (config date 2026-11-07 is newer than the bundled workerd supports).
- Screenshots use `prefers-reduced-motion: reduce` so scroll-reveal content is visible. Element crops hide fixed and sticky chrome; the `*-top.png` shots keep it.

## Files
- `{en,vi}-{390,768,1440}-{light,dark}-{top,tracks,periods,method,migration,workers-heading}.png`
- The 390 `tracks` shots are a 390x3000 viewport at the top of `.track-list`, because track cards use `content-visibility: auto` on phones.
- `edufest-2026-{390,1440}-{light,dark}-{full,wsgroups}.png`
- `evidence/`: screenshot report (column counts and logo plate colours), axe reports for head, base and the online head build, Lighthouse summaries (3-run all pages, plus a 5-run recheck of the vi pages), and the canonical-smoke output.

## Column counts measured (computed column-count / distinct column x positions)
- 390: auto/1
- 768: 2/2
- 1440: 3/3

This holds on `.track-list`, `.period-groups`, `.method dl`, `.migration-list` and EduFest `.ws-groups`.
