# Roadmap interactive pulse (5bfc3371)

Local `wrangler dev --local` of `build:cloudflare` (no GitHub token) at
5bfc3371e0db44214ca6522f486b8e20e3842a4e.

- `hero-*`, `pulse-*`, `catchup-*`: 390 and 1440, light and dark, EN and VI.
- `hover-1440-dark-en`, `hover-1440-light-vi`: mouse hover tooltip.
- `tap-390-dark-en`: tap on a day (touch layout of the tooltip).
- `keyboard-390-light-vi`: roving focus moved with the arrow keys.
- `range-30d-1440-light-en`: 30-day range with the history loaded.
- `since-last-visit-1440-dark-en`: the divider with a stored previous visit.

Patch notes show the repository's test fixture
(`apps/roadmap/src/changelog/fixtures/changelog.json`), copied into
`.generated/changelog.json` for these captures only. Production builds show
the section only when the changelog pipeline writes a valid file. The build's
GitHub core reads were rate-limited (anonymous), so live data is the committed
snapshot; all-PR counts and production build times are this build's own
observations.
