# Store listings

Single source of truth for the Tuturuuu app's store listings (bundle
`com.tuturuuu.app.mobile`; Microsoft Store product `9N7B6VC7RR7W`). Store
uploads and the store release view in `packages/roadmap-core` read these files;
edit copy here, never in a store console.

## Layout

```text
apps/mobile/store/
  metadata/                public; bundled into tuturuuu.com/roadmap
    schema.json            JSON Schema for every listing file
    types.ts               TypeScript types matching the schema
    ios.json               App Store, iPhone and iPad
    macos.json             Mac App Store
    android.json           Google Play
    windows.json           Microsoft Store
  internal/                never bundled: package identity and similar
    windows.json
  screenshots/<slug>/<device>/<locale>/NN-<id>.jpg   store uploads
  screenshots/<slug>/web/NN-<id>.webp                roadmap gallery
  graphics/<slug>/*.png
```

Each listing holds `store`, `slug`, `platform`, `productId`, `category`,
`release`, `urls`, `listing` (store copy), `screenshotDevices`, `screenshots`,
`gallery` and, for Google Play and the Microsoft Store, `graphics`.

Every user-visible string is an `{ "en": ..., "vi": ... }` object at field
level: listing copy, each feature and search term, screenshot captions and
gallery alt text. Store limits apply to each language value.

`release.status` is one of `planned`, `preparing`, `submitted`, `in_review`,
`approved`, `live` or `rejected`. `version` and `build` are strings. Target
dates and `submittedAt`, `approvedAt`, `liveAt` are ISO 8601 date-times with an
offset (`2026-11-28T23:59:00+07:00`) or `null`. A status needs its milestones:
`submitted`/`in_review` need `submittedAt`, `approved` adds `approvedAt`, and
`live` adds `liveAt` and `storeUrl`.

Screenshot file names are the 1-based position plus the id, so reordering
screens renames files. Captions are overlay text for the screenshot lane; only
the Microsoft Store uploads them as listing captions.

## Public data

The metadata files are public. Keep reviewer notes, credentials, ticket links,
account, team, issuer and publisher ids out of them; put values a tool needs in
`internal/`. URLs must be https on `tuturuuu.com`, `apps.apple.com`,
`play.google.com` or `apps.microsoft.com`, without query strings. The validator
rejects private-looking keys, GUIDs, certificate subjects, email addresses,
other URL hosts and any value recorded in `internal/`.

## Limits

Lengths count Unicode characters of NFC text. Apple keywords count UTF-8 bytes,
so Vietnamese diacritics cost two or three bytes each.

| Store | Field | Limit |
| --- | --- | --- |
| App Store | `name`, `nameFallback`, `subtitle` | 30 |
| App Store | `promotionalText` | 170 |
| App Store | `description`, `whatsNew` | 4000 |
| App Store | `keywords` | 100 bytes, comma-separated, no space after commas, no app name |
| App Store, Google Play | screenshot `caption` | 60 |
| Google Play | `title` | 30 |
| Google Play | `shortDescription` | 80 |
| Google Play | `fullDescription` | 4000 |
| Google Play | `whatsNew` | 500 |
| Microsoft Store | `shortDescription` | 1000 (warning above 270) |
| Microsoft Store | `description` | 10000 |
| Microsoft Store | `features` | 20 items, 200 each |
| Microsoft Store | `searchTerms` | 7 unique terms, 40 each (warning above 30), 21 words per language, no padding or app name |
| Microsoft Store | screenshot `caption` | 200 |
| All | gallery `alt` | 150 |

`whatsNew` and `releaseNotes` stay `null` for the first version.

| Asset | Size |
| --- | --- |
| `iphone-6.9` / `iphone-6.5` / `ipad-13` | 1320x2868 / 1284x2778 / 2064x2752 JPEG |
| `mac` | 2880x1800 JPEG |
| Play `phone` / `tablet7` / `tablet10` | 1080x1920 / 1200x1920 / 1600x2560 JPEG |
| Play icon / feature graphic | 512x512 / 1024x500 PNG |
| Windows `desktop` | 1920x1080 or larger JPEG |
| Windows tile / hero | 300x300 / 1920x1080 PNG |
| `gallery` | at most 6 WebP, long edge at most 1280 px, at most 150,000 bytes |

Sources: App Store Connect
[app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
and [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information);
Google Play [app details](https://support.google.com/googleplay/android-developer/answer/9859152)
and [release notes](https://support.google.com/googleplay/android-developer/answer/9859348);
Microsoft Store [listing info](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
and [keywords](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/add-additional-information).
Partner Center labels search terms "Keywords".

The validator also rejects emoji, non-NFC text, ranking claims ("best", "#1",
"tốt nhất"), prices, other products' names and, in App Store listings, other
platforms or marketplaces (Guideline 2.3.10). Every feature claim in the copy
must match shipped behavior in `apps/mobile/lib/features`.

## Validate

```bash
node scripts/store-metadata/validate.mjs                    # limits, consistency, public data
node scripts/store-metadata/validate.mjs --counts           # per-field character and byte counts
node scripts/store-metadata/validate.mjs --require-assets   # also fail on missing images
node --test 'scripts/store-metadata/*.test.mjs'
```

Without `--require-assets`, missing screenshots, gallery images and graphics
are reported as pending. Assets that exist are always checked for format,
dimensions and, for the gallery, file size. The tests also run in
`bun test:scripts`.

## Consumers

- Store submission tooling (App Store Connect, Play Console, Partner Center)
  reads `listing`, `screenshots` and `graphics`.
- `packages/roadmap-core` imports the metadata JSON at build time for the
  tuturuuu.com/roadmap store release view (`store`, `platform`, `release`,
  `urls`, `gallery`), typed by `metadata/types.ts`. It never reads
  `internal/`.
- `scripts/desktop-deployment/windows-store-listing.md` holds the Microsoft
  Store reviewer notes and certification checklist; `windows.json` supersedes
  its listing copy.
