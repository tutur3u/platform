# Tuturuuu Mail native frontend

Mail's candidate frontend uses plain TanStack Start SSR, Vite+ and the official
Void Cloudflare plugin. The retained `src/app` entries are canonical suppliers
and rollback source. The native router renders Mail locally; only API paths
already owned by Web use the central fallback.

The frontend Worker name `tuturuuu-mail` is proposed. Its domain/account/hosted
identity has not been qualified. `void.config.ts` intentionally adds no custom
domain, database, product bucket, queue, Durable Object or scheduler. Preserve
`wrangler.email-routing.jsonc`: it owns a separate ingress Worker and the existing
mail bucket/signature contract. The frontend keeps credentialed existing R2/S3
object locations; it does not create or migrate mail storage.

After parent dependency assembly, development uses `bun run dev:app` on loopback
port 7820. `bun run build` invokes `vp build` **in CI only**. The old Next commands
remain `build:legacy`, `dev:legacy` and `start:legacy` for the authorized rollback
owner. Do not run `void deploy` to rebuild or provision after qualification.
Parent CI must discover the actual `.wrangler/deploy/config.json` target, validate
its `configPath` and empty `auxiliaryWorkers`, qualify/seal the emitted bytes and
publish those exact bytes through the existing Wrangler path. Generate bindings
from that emitted config with `--env-interface CloudflareEnv
--include-runtime=false`; the checked-in declaration is a source placeholder.

`src/runtime/request-context.ts` isolates headers, cookies, response mutations and
Worker context per request. The original proxy still owns document/API security,
SSO verification, refresh, first-party CORS and signed-provider webhook exceptions.
Native loader navigation repeats document policy. Native functions use framework
CSRF middleware, GET/JSON POST method checks and a 1 MiB action-body limit; raw
webhooks, attachments and other original API bodies retain their own policies.
All 41 original API route sources have explicit native method/parameter adapters.
The nine folder pages share one browser workspace. Server models retain actor,
staff/personal, membership and invitation checks before client composition.

Framework aliases are app-local. Relative shared workspace/realtime actions get
native function transports instead of importing server suppliers into the browser.
Realtime debug logging retains the canonical server supplier behind actor and
workspace authorization. Its timer/buffer lifecycle is an explicit Worker
qualification candidate. No global console drain is installed. Google Takeout
filesystem imports are CLI-only in the current source graph.

Migration regressions are authored but **UNRUN** under the current custody hold.
Pinned Biome and source/diff inspection are not compiler/runtime proof. Parent
must run exact-commit type/lint/tests/build, inspect emitted client/server imports,
and exercise actual Worker routes and native functions, including concurrent
identity/locale isolation, SSO/logout/cookie multiplicity, CORS/signature negatives,
OAuth state/callback/account binding, mailbox/reviewer authorization, ranges and
R2/S3 object identity, uncertain sends without replay, and ingest idempotency.
AWS SDK, mailauth/DNS, development logging and provider transport compatibility
remain unverified under workerd. Hosted identity/domain/secrets, provider
acceptance, artifact rollback and production delivery belong to the parent.


## Source correction boundaries

`env.example` is the byte-preserved setup template. Copy it to `.env` for an
explicitly authorized local setup. Void 1.1.12 rejects `.env.*` and `.dev.vars*`
files in the project root, including `.env.example`; the template is deliberately
named `env.example`, not a dotenv variant. This rename changes no variable value.

Mail's default is strict, noncomposite app checking with no output, followed by
checked Mail-only declaration emission and the actual Worker check:
`bun run type-check:app && bun run type-check:boundary && bun run type-check:worker`.
The owning `type-check` script requires that order. Both app programs retain every
current src/scripts/messages/root TypeScript root and imported source semantics.
Package source/dist exports remain authoritative; no shared declaration producer
or types-source alias is added. Existing dependency builds and full package type
checks remain inherited Turbo prerequisites.

Mail's direct production/test module edges use package exports, not relative
foreign implementation imports. The authorized realtime supplier uses the narrow
`@tuturuuu/supabase/next/realtime-log-actions` export: existing dist declarations
for types, existing source for Bun, existing dist JS by default. Its current
Supabase build already includes that source; no producer/config is added.
Satellite workspace actions and invitation cards use their existing public
exports. The app-local action-port resolver redirects client requests while
exempting `.server.ts` suppliers; no global alias redirects the server supplier
back into its native function. Filesystem alias/fixture paths are not compiler
module imports. Static edge regressions and package mappings remain authored
UNRUN, and real clean compiler classification/declaration closure still requires CI.

The app has DOM types and explicit Vite/Node ambient types. The boundary config
inherits its full roots and strictness, sets rootDir `.`, noEmitOnError and
incremental false, and emits only declarations/maps into `.typecheck/app`.
The ESNext-only Worker program includes the actual Worker and generated bindings;
its sole `#mail-handler` alias points to the emitted handler.d.ts, with no source
fallback. Vite resolves exactly that specifier to the real handler.ts at runtime.
The actual adapter retains `satisfies ExportedHandler<CloudflareEnv>`. Portable
request contracts retain minimal ASSETS.fetch and waitUntil interfaces.

The existing app-local Turbo outputs include `.typecheck/**`; inherited inputs,
dependencies and outputs remain intact. Missing bridge declarations must fail;
no stubs, force or cache waiver are accepted. The checked-in CloudflareEnv is only
a placeholder: qualify actual generated binding-only declarations from the emitted
config before acceptance. The current cf:typegen shortcut alone does not establish
that target. Pinned compiler workspace-external classification, rootDir behavior
and genuine handler declaration closure remain UNPROVEN. Unexpected foreign
emission or incompatible contracts must stop qualification, not expand roots or
exclude sources. Parent must qualify clean and restored-cache graphs, actual
compiler diagnostics and Worker compatibility; none has run under this hold.

Notification URLs retain the canonical server resolution of `TTR_URL`, production
default or `CENTRAL_PORT`. The authorized workspace model serializes only the
resolved public `notificationWebAppUrl` into the view/client popover. Browser env
replacement must not be used to recover server configuration, and arbitrary
server environment values must not be serialized. Real SSR/hydration acceptance
remains parent-owned and unrun.
