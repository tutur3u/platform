# CMS renderer

TanStack Start + Void + Vite+ Worker. The synthetic first-site fixture is never a production fallback. Unknown hosts, missing published pointers and unsupported schemas fail closed.

Rex deploys the CI artifact, using its emitted `dist/server/wrangler.json`. This lane never deploys. Configure `CMS_DELIVERY_ORIGIN` as the HTTPS origin serving the reviewed Rust public delivery endpoint. Rust is not currently the production API runtime; the existing live endpoint must not be assumed to return page snapshots.

Configure `CMS_SITES` as a hostname-keyed JSON object. Each site supplies `id`, `workspaceId`, `defaultLocale` and optional `tokens` (`foreground`/`background` hex colors and `font`: serif, sans-serif or monospace). Domain admission belongs to the deployment owner; this is not a self-service domain verification API. Do not route a domain before its ownership is verified.

Entries use full public-path slugs: `home` for `/`, `en` for `/en`, and `en/about` for `/en/about`. Languages remain separate entries. Entry `metadata.description` and `metadata.ogImage` provide page SEO; entry `title` supplies title and OG title. Confirm those paths with the content owner before cutover. Content porting is outside this lane.

The cache key contains site ID, normalized path, locale and immutable version ID. Published delivery responses use a 30-second CDN TTL and HTML uses a 30-second edge TTL. Configure `CMS_PURGE_TOKEN` through the secret manager. A publish hook can POST `{ "path": "/", "locale": "vi", "version": "previous-version-id" }` to `/__cms/purge` on the site host with bearer authorization. The hook registration belongs to the publishing owner and is not wired by this source change. Version-key changes independently avoid serving the old HTML after delivery refreshes.

`bun run build` generates the route tree, then `bun run type-check` validates it. CI runs focused renderer/SDK checks and the Rust delivery module tests before uploading an artifact. No credentials, live records, custom hostname or production route are included.
