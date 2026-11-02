# JetBrains Mono

`jetbrains-mono-variable.woff2` is the normal variable font from JetBrains Mono,
converted from its upstream TTF to WOFF2 with FontTools and Brotli. It retains
all glyphs and the original 100–800 weight axis, including Vietnamese coverage.

Source: https://github.com/JetBrains/JetBrainsMono/tree/19371302b95d218af43299bce79ddbddd0bc364d/fonts/variable
License: SIL Open Font License 1.1, included in `OFL-JetBrainsMono.txt`.

This file is no longer served. It is the hash-checked input that
`scripts/fonts/subset_web_fonts.py` subsets into the content-hashed
`apps/web/public/fonts/subsets/jetbrains-mono-*.woff2` files. The marketing
layout loads those through `apps/web/src/fonts/marketing.css` and preloads them
with `apps/web/src/fonts/preload-sets.ts`. See
`apps/docs/build/development-tools/web-font-subsets.mdx` before changing it.
