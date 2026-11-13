The build runs `scripts/generate-changelog.mjs` before Vite. Import `changelog`
from `./data.ts`; it is a parsed `Changelog | null` embedded as eager JSON.
There is no request-time generation or runtime origin. `.generated/` is ignored.

Release slots are merged production release-please PRs titled exactly
`chore(release): release production`. Main PRs belong to `(previous merged_at,
current merged_at]`. The last eleven markers provide ten complete windows.
Only the existing public feed's eligible titles and track mapping are published;
empty release windows are retained. A slot is a release marker, not independent
proof that every app deployed successfully.

The generator accesses only the public repository API anonymously. Pagination,
requests, input bodies, output arrays, and total network time are bounded. An
incomplete fetch or rate limit preserves a validated cache or removes stale
output if none is available. It never publishes an incomplete window.

LLM use requires `GEMINI_API_KEY` and a GitHub main push, or a manual main or
production build. PR events always fall back. The model is
`gemini-3.1-flash-lite` (the stable cheap model constant in
`packages/ai/src/credits/model-mapping.ts`). No workflow receives a key here.
PR content is untrusted data; plain-text output must pass the shared parser,
retain release identity, and cite only the supplied PRs in their mapped track.
Any invalid output replaces the entire release with deterministic fallback.
Errors contain short codes only. The key travels only in `x-goog-api-key`.

Per-release caches use SHA plus a SHA-256 hash of the bounded input content,
policy version, model and fallback structure. Fallback results are cached too;
a later key does not upgrade an unchanged cached release. A validated full
snapshot permits recovery during API failure. A separate deterministic fallback
snapshot prevents PR or offline builds from reusing LLM prose. Mixed results
are labeled fallback at the document level. Cache persistence across clean CI
checkouts requires the builder to retain `.generated/changelog-cache/`.

`ROADMAP_OFFLINE=1` makes no network calls. It restores an eligible snapshot or
removes the generated JSON, allowing the UI to hide the section. Fallback item
text is identical in English and Vietnamese; only LLM mode translates it.
