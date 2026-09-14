# Dependency refresh — 2026-09-14

## Scope

Updated 619 dependency declarations across 72 JavaScript workspace manifests
(114 distinct packages), the Rust dependency floors and lockfile, the Python
lockfile, and 24 resolved Flutter dependencies. Resolution and frozen-install
verification use the repository's pinned Bun 1.4.1.

Major JavaScript updates include Jotai 3, Mermaid 12, React-PDF 11, and the
Mattermost adapter 2. React and React DOM move together to 19.3.0; Next.js and its
root override move together to 16.3.5.

## Compatibility

- The shared PDF viewer sets `suspense={false}` to retain its loading and error
  behavior. Its worker URL already derives from `pdfjs.version`, keeping the
  worker aligned with React-PDF's PDF.js 6 dependency.
- Both Mermaid chat renderers explicitly retain the dagre layout and classic
  appearance. Existing theme and strict security settings remain in effect.
- The minimum Node.js version is 22.13.0 to match React-PDF 11. CI uses Node.js 24.
- Miniflare stays at stable 4.20260730.0 because its registry `latest` tag points
  to 5.20260911.0-alpha. No prerelease adoption or global release-age bypass was
  added.
- Flutter retains its vendored `flutter_pcm_sound` override and transitive
  constraints imposed by the Flutter SDK and upstream packages. Cargo retains
  upstream's pinned `matchit` 0.8.4 dependency.

Upstream migration references:

- [Jotai 3 migration](https://github.com/pmndrs/jotai/blob/main/docs/guides/migrating-to-v3.mdx)
- [Mermaid 12 release](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0)
- [React-PDF 11 migration](https://github.com/wojtekmaj/react-pdf/wiki/Upgrade-guide-from-version-10.x-to-11.x)

The current stable Rust Clippy also requires range containment syntax for two
existing billing-seat guards. Their inclusive bounds and behavior are unchanged.

## Audit limits

The registry audit reports the same 27 advisory records for both the original
and refreshed lockfiles: 11 high, 13 moderate, and 3 low, across 10 packages.
Affected package names are `@opentelemetry/core`, `esbuild`, `joi`, `lodash-es`,
`nanoid`, `nodemailer`, `sharp`, `speaker`, `undici`, and `uuid`. The refresh does
not eliminate these pre-existing transitive advisories; no global overrides were
added to force incompatible versions into upstream dependency trees.

Native CocoaPods installation succeeds on iOS and macOS. CocoaPods still reports
custom build-configuration warnings and Firebase's announced CocoaPods
deprecation. Installation alone does not prove a signed mobile release build.

Playground's `/` build still fails because its next-intl configuration is missing.
The [September 5 audit](2026-09-05-dependencies.md) records reproduction on unchanged
main at `67d0c59520b8`; Playground's layout and Next configuration are unchanged
from that baseline. The initial complete build pass includes this failure; the
final build pass excludes Playground rather than changing unrelated app setup.
External also reproduces its documented missing-Supabase-URL failure on `/supabase`;
its page and Next configuration are unchanged from the same baseline. The final
pass excludes External as well.

## Verification

The completed local validation pass used Bun 1.4.1:

- Frozen Bun install passed without lockfile changes.
- `bun check --run-all` passed all 21 gates, including tests, type checks,
  Biome, script tests, Python, and translation checks.
- The focused chat-adapter suite passed 11 tests; release-workflow validation
  passed 33 tests.
- `bun check:mobile` passed analysis and all 522 Flutter tests.
- `bun check:backend` passed formatting, Clippy, all 3,120 tests, and the
  WebAssembly worker-target check.
- The final app/package build pass completed 36 tasks successfully (35 cached),
  excluding the two documented Playground and External baseline failures above.
- `git diff --check` passed. No tracked changes were modified after the final
  validation completed at 11:49 local time on September 14.

These are local validation results. GitHub CI, merge, deployment, and signed
mobile release builds have not been verified as part of this completed pass.
