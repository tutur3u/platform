# Meet native Start runtime

Meet uses TanStack Start loaders and server functions, Vite+, and the official
Void SDK Cloudflare build adapter. RSC is disabled. The retained Next route tree
records the previous implementation; `src/router.tsx` and `src/runtime` own the
native page dispatch. The shared Meet core still owns calls and domain rules.

## Runtime contract

The custom entry is `cloudflare/worker.ts`. It preserves `tuturuuu-meet`, the
`MeetLiveDurableObject` and `MeetingAIProvider` exports, existing Live guards,
bindings, resource IDs, placement, and DO migration history. The separate
`apps/meet-realtime` Worker, SFU, and TURN services remain independent.
`wrangler.legacy.jsonc` retains the previous Wrangler configuration byte for byte.
`void.config.ts` defines the native build configuration.

`src/runtime/handler.ts` serves explicit public assets, executes the original
document/API proxy through an isolated request bridge, dispatches local API
handlers, and forwards remaining `/api/` traffic to the existing web API.
Static assets use `run_worker_first: true` and `not_found_handling: none` so a
file cannot bypass page authorization or SSR. Start receives the browser URL;
locale rewrites and refreshed headers remain in the per-request context.

English URLs remain unprefixed and Vietnamese URLs use `/vi`. Loaders resolve
the satellite session, tenant membership, permissions, room policy, and plan
snapshot before rendering. Page models contain only the fields needed by the
browser. Existing React call, chat, media, recording, calendar, and plan controls
continue using their owning shared implementations.

The exact `/_meet/functions` prefix handles native functions. Requests retain
session refresh and API abuse guards. Start enforces CSRF checks, and POST
requires JSON. Nine legacy plan mutations use native POST transports with strict
argument tuples and server-only canonical suppliers. Guest login and credential
bound guest option/vote actions remain public. Authenticated operations deny an
unsigned actor before loading suppliers; canonical suppliers still enforce
ownership, guest credentials, and plan locks. Confirmed mutations invalidate the
visible native route. Failed mutations do not claim success or refresh.

`@tuturuuu/start-bridge` owns request headers/cookies, middleware dispatch,
function admission, navigation, localization, render-cache revalidation, images,
links, dynamic imports and Cloudflare context. App-local modules retain stable
import paths through thin re-exports; Meet keeps its page models, diagnostics,
plan action transports and typed Worker port. All adapters use the same bridge
request store.

`start-bridge.routes.json` registers every retained App Router page and API.
Regenerate after adding or moving a route, then check the committed output:

```sh
bun packages/start-bridge/src/codegen/cli.ts generate apps/meet
bun packages/start-bridge/src/codegen/cli.ts check apps/meet
```

The generated page pattern union requires an explicit model dispatch kind in
`src/runtime/page-routing.ts`. Public room previews retain both localized and
unlocalized aliases. CI rejects stale registries before the frontend build.
Root/subdomain operation is the bridge-adoption baseline. Dual-host mounting,
per-app cookie acceptance and hosted staging remain separate qualification gates;
production publication stays held until the explicit cutover PR. Real transitional Next imports remain:
`next/dist/server/web/spec-extension/{request,response}`, the compiled edge cookie
classes, and `next/dist/shared/lib/router/utils/format-url`. Next types remain in
retained source. This runtime has not fully removed the Next dependency.
The Cloudflare OG adapter includes Wasm and font data modules; CI must qualify
those emitted modules alongside the Worker and client assets.

## Commands and artifacts

`env.example` is the tracked placeholder template. For local development, copy
`env.example` to `.env` and fill the required values privately. Keep `.env` out
of Git. Void supports one local `.env` file and rejects `.env.example` and other
dotenv variants; the non-dot template is not loaded as configuration.

The package manager is Bun 1.4.4. CI uses Node 24.22.0, satisfying Void's
Node >=24.21 requirement. `bun run build:cloudflare` invokes `vp build`.
The development command uses loopback port 7807; central web API development
uses port 7803. Local release builds are prohibited by repository policy.

CI discovers the actual emitted Wrangler configuration through
`.wrangler/deploy/config.json`. The expected plain SSR output is under
`dist/ssr`, with client assets under `dist/client`; actual emission must be
proved by the exact-source CI build. Type generation and runtime probes use
the discovered configuration and app-local Wrangler.

Void 1.1.12's direct Cloudflare deploy command rebuilds and prepares artifacts
after build hooks. It also rejects the existing targeted placement during secret
pinning. A build-tail check does not qualify its final published artifact.
The parent-owned workflow therefore separates the Void SDK build from candidate
Wrangler publication of the exact qualified artifacts. This is not a claim of
equivalent direct Void CLI deployment. Publication requires parent approval of
the emitted identity, bindings, artifact integrity, runtime acceptance, and
rollback contract. No deployment or resource provisioning is part of this source
handoff.

## Verification and rollback limits

`tsconfig.json` is a project-reference solution. `tsconfig.app.json` checks native
SSR and browser sources with DOM types and emits declarations under
`.turbo/types/app`. `tsconfig.cloudflare.json` consumes those declarations and
checks the custom Worker, Live/provider roots, generated bindings, and existing
realtime backend roots against Workers types, emitting `.turbo/types/worker`.
Both projects remain composite and emit declarations only. The native request
port passes the actual environment object unchanged without loading Worker
globals into the browser project.

`type-check` and `cf:typecheck` run the app-local `scripts/type-check.cjs`,
which invokes the existing cache-invalidation wrapper once with `--build`.
CI alone executes this declaration build. After success, the helper records
all emitted declarations/maps in `.turbo/types/outputs.json`. A missing or
invalid receipt clears only the two owned project build-info files. Missing app
outputs clear app and dependent Worker build info; missing Worker outputs clear
only Worker build info. Failed or interrupted compilation leaves no receipt.
It does not delete declarations or use `--force`. Symlinked cache paths fail
closed before metadata deletion.

The app-local Turbo config adds `.turbo/types/**`, including the receipt, to
inherited outputs. Project build info remains at `.turbo/tsconfig.tsbuildinfo`
and `dist/tsconfig.tsbuildinfo`; the existing wrapper retains its dependency
fingerprint invalidation. Leaf configs and sources remain Turbo/TypeScript inputs,
not additional wrapper fingerprint inputs. TypeScript alone did not regenerate
missing declarations with retained build info in CI; the recovery helper and
cold/restored/source/config regression require new exact-commit CI proof.

Focused bridge, routing, native function, tuple, and authorization regressions
live under `src/runtime/*.test.ts`. Authored tests are not runtime proof.
The migration requires exact-commit CI test, type, lint, and build results,
emitted server/client boundary inspection, and actual Worker probes before
cutover. Signed-in workspace, cross-tenant, room, plan, and guest mutation
fixtures remain mandatory. Local fixtures cannot prove hosted SFU/TURN behavior.

Direct production cutover has no staging deployment. The parent captures the
current hosted Worker version/configuration and rollback identity, qualifies the
exact candidate, deploys it to the existing Worker, and verifies bilingual
authentication, tenant denial, plans, rooms, and multi-participant media. A failed
acceptance gate requires restoring the captured existing Worker version; retained
source files alone are not a deployable rollback artifact.
