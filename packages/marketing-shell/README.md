# @tuturuuu/marketing-shell

One marketing layout for every Tuturuuu marketing page (`/home`, `/roadmap`,
`/design`, `/download`, `/branding`, pricing, about, products, blog, legal),
whichever app serves it.

- `MarketingShell`: floating pill navbar, `#main-content` (`pt-20`), footer.
- `MarketingNavbar` / `MarketingFooter`: the pieces, for custom frames.
- `createTranslator(locale)`: the shell's EN/VI strings (same keys as
  `apps/marketing/messages`), or pass the host app's own `t`.
- `@tuturuuu/marketing-shell/fonts.css`: self-hosted Be Vietnam Pro and
  JetBrains Mono (SIL OFL 1.1, licences in `src/fonts/`). Add the
  `marketing-fonts` class (the shell does) so `--font-display` and
  `--font-mono-ui` from `@tuturuuu/ui/globals.css` resolve.

Framework-agnostic: hosts pass `LinkComponent`, `ImageComponent`, `pathname`,
`locale`/`onLocaleChange`, `logoSrc` and `signInHref`. Tailwind hosts must add
`@source` for `packages/marketing-shell/src` so the classes are generated.

Marketing hosts with server components can pass an `actions` slot so the brand,
navigation copy and footer remain server-rendered. `MarketingActions` is the
small client adapter; its mobile sheet loads on first use. Closed panels are
hidden from keyboard navigation, and constrained devices skip shell motion.

The mono face uses EN/VI unicode subsets; the full face covers other glyphs.
The upstream file and OFL remain
in `src/fonts`. Regenerate with `scripts/subset-mono.py` using fonttools[woff]
4.60.2 and brotli 1.2.1. The normal 400 face pins that axis to avoid downloading unused weights. Other
weights retain their variable axis. Outlines, hinting and the OFL remain intact.
