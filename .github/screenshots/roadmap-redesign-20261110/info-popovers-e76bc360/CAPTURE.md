# Info popovers and tooltips — captures

- Source: tutur3u/platform `e76bc36039c2ce87d0c058e83d6c71901d191e2c` (branch `feat/roadmap-info-popovers-20261114`), base `34d1f96ecb9892227fd6737650c0ad98d4f730a9`.
- Build: `ROADMAP_OFFLINE=1 ROADMAP_SOURCE_SHA=e76bc36039c2ce87d0c058e83d6c71901d191e2c bun run build:cloudflare`, served by the pre-seal doctor's workerd harness as `tuturuuu.com` on loopback.
- Browser: Google Chrome (Playwright 1.64.1). 390px: 390×844 @2x, touch, mobile. 1440px: 1440×900 @1x.
- Routes: `/roadmap` (en), `/roadmap/vi` (vi). Themes: `prefers-color-scheme` light and dark.
- `<lang>-<theme>-<width>-popover.png`: "How statuses are computed" opened by a tap/click.
- `<lang>-<theme>-<width>-tooltip.png`: the "Live" legend tooltip (hover at 1440, tap at 390).
- `<lang>-<theme>-1440-hosting-popover.png`: the "Where each app runs" (i) panel.
- `en-nojs-390-tooltip.png`: JavaScript disabled; a tap still opens the tooltip (native popover).
- `checks.json`: keyboard, focus-return, no-JS, first-tap-before-hydration and layout-shift checks (37/37 pass).
- Offline build: hosting and migration show "not verifiable"; numbers come from the committed snapshot plus the browser's live refresh.
