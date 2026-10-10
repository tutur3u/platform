# JetBrains Mono

`jetbrains-mono-variable.woff2` is the normal variable font from JetBrains Mono,
converted from its upstream TTF to WOFF2 with FontTools and Brotli. It retains
all glyphs and the original 100–800 weight axis, including Vietnamese coverage.

Source: https://github.com/JetBrains/JetBrainsMono/tree/19371302b95d218af43299bce79ddbddd0bc364d/fonts/variable
License: SIL Open Font License 1.1, included in `OFL-JetBrainsMono.txt`.

The marketing layout uses `next/font/local` to preserve the typeface without
requiring Turbopack's Google Fonts URL resolver during builds.
