# Cloudflare logo

`cloudflare-logo.png` is Cloudflare's official company logo, byte-for-byte
as published in Cloudflare's press kit:

| Field          | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Source page    | https://www.cloudflare.com/press-kit/ ("Company logos – Logo on transparent and white background")                          |
| Archive        | https://cf-assets.www.cloudflare.com/dzlvafdwdttg/2Twekn3xyYyd94qDYAl0ed/9ab649caa40958f195166e0d9f5d9a04/Logos.zip         |
| Archive SHA256 | `00420d13d6541742116e2de5f0fd496a0b6532d9dc00d43c55867c84b43e56a5`                                                          |
| File in zip    | `CF-Logo 1.png`                                                                                                             |
| File SHA256    | `400b70b8bb7db80da137ef8e8fcb835a692410a3083598964da08ed1756df145`                                                          |
| Format         | PNG, 512×173, transparent background                                                                                        |
| Retrieved      | 2026-11-14                                                                                                                  |
| Terms          | https://www.cloudflare.com/trademark/                                                                                       |

The press kit offers no SVG and no dark-background variant.

## Decision

The roadmap's hosting section shows this logo beside the "Cloudflare
Workers" group heading. The product owner chose the logo over Cloudflare's
"Protected by Cloudflare" web badge on 2026-11-14; this decision takes
precedence over the badge-only reading of Cloudflare's trademark guidelines.
The page carries Cloudflare's trademark attribution line (`hosting.trademark`
in `messages/`).

## Rules for this file

- Serve it from this Worker (imported with `?no-inline`); never hotlink it.
- Keep it unmodified: no recolouring, filters, rounding, cropping or effects.
- Render it at its own aspect ratio only (`width={512} height={173}` plus
  CSS `aspect-ratio: 512 / 173`), about 48px tall.
- Keep it apart from other words: it sits on its own plate with at least
  12px of clear space, never inside a heading or sentence.
- Dark theme: the plate keeps a light ground (`var(--rm-ink)` under `.dark`)
  because the wordmark is black; the logo itself never changes.

`src/hosting.test.ts` pins the hash and these rendering rules.
