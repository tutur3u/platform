# Cloudflare mark

`cloudflare-mark.svg` is Cloudflare's cloud mark: the logomark alone, with no
wordmark and no "Protected by Cloudflare" badge. It is the SVG that Cloudflare
publishes on cloudflare.com, with only non-rendering bytes removed.

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Source URL       | https://www.cloudflare.com/logo.svg                                                    |
| Published as     | The `logo` of the schema.org `Organization` JSON-LD on https://www.cloudflare.com/     |
| Retrieved        | 2026-11-15 16:57 UTC (response `ETag: "39ed5a606f05a79f4f821a22c837cbe0"`)             |
| Source SHA256    | `c9ec1d5d5e4b0924666756a70179395c26b010372f8d7eec3539575281cebf1b` (1396 bytes)        |
| Committed SHA256 | `4812db5be0468fb53d92a6647c69b0b7930da8ed46289b505166a7352bbb8c5d` (1334 bytes)        |
| Format           | SVG, `viewBox="0 0 341 156"`, two paths filled `#FAAE40` and `#F38020`                  |
| Terms            | https://www.cloudflare.com/trademark/ and https://www.cloudflare.com/brand/logo/       |

## Why this source

Cloudflare's press kit (https://www.cloudflare.com/press-kit/) offers its logo
only as PNG and JPG files with the wordmark (`Logos.zip`), plus the
"Protected by Cloudflare" web badges. The brand guidelines' logo page
(https://www.cloudflare.com/brand/logo/) shows the logomark as raster
previews and links its downloads to an asset library that requires a
Cloudflare-issued sign-in. `https://www.cloudflare.com/logo.svg` is the
official vector of the mark alone that Cloudflare publishes openly. The file
is not traced, redrawn or taken from an icon pack.

## Lossless optimisation

Removed only:

- the `<title>Cloudflare logo</title>` element (the mark is decorative here,
  see below);
- line breaks and indentation between tags and attributes.

The root `<svg>` attributes, both `d` values and both `fill` values are
byte-identical to the source and in the same order.

Image optimisers must not touch it: `.imgbotconfig` lists it in
`ignoredFiles`, because ImgBot reordered the root attributes once (#8440)
and `src/hosting.test.ts` pins the committed SHA256.

## Colour

The fills stay exactly as published (`#F38020`, `#FAAE40`). The brand
guidelines name the logomark colours Tangerine `#F6821F` and Mango `#FBAD41`;
the file is not recoloured towards either set ("Do not alter colors").

## Usage rules this page follows

- Unmodified: no recolouring, filter, effect, background fill, clipping,
  rounding or stretching ("The logo should not be modified in any way",
  "Do not add new effects", "Do not fill the flare with color"). CSS sets only
  its height and the file's own 341:156 ratio, and `border-radius: 0`
  overrides the rounding the other platform glyphs get.
- Backgrounds: the guidelines use the standard colour logo on both white and
  black grounds; only the black logotype needs the white version on dark
  grounds. The mark has no black part, so the same file serves the light and
  dark themes.
- Placement: it is the Workers platform glyph, in the same places and at the
  same 10px height as the Vercel triangle (the "Cloudflare Workers" group
  heading and the hosting legend), about 22px wide. The guidelines' minimum
  sizes cover the logo with its wordmark and set none for the mark alone. As
  a vector it is sharp at 1x and 2x.
- Decorative: the "Cloudflare Workers" label beside it carries the meaning, so
  it has `alt=""` and `aria-hidden`.
- Served by this Worker (imported with `?no-inline`, emitted as a hashed asset
  under `/roadmap/assets/`); never hotlinked or inlined as a `data:` URI.
- Attribution: whenever a Workers host is listed, the page carries
  Cloudflare's trademark line (`hosting.trademark` in `messages/`).

## Decision

Cloudflare's trademark guidelines allow logo use other than the web badges
only with written permission. The product owner chose this mark, used like
the Vercel triangle, over both the "Protected by Cloudflare" badge and the
full wordmark logo; that decision takes precedence over the badge-only
reading of the guidelines.

`src/hosting.test.ts` pins the hash, the official paths and these rendering
rules.
