# Cloudflare migration reference for agents

This reference covers the dependencies used by the native Start migration.
It supplements the repository instructions and the owning app's source.
It does not authorize installation, resource creation, migration application, or deployment.

## Sources and version scope

Repository examples were checked against commit
`01420502bd5902a40d3ff671116ab3cc5255e4f0`.
The owning workspace manifest and `bun.lock` determine the version for an operation.
A package's transitive dependencies can have different versions.
Upstream links marked `latest` can change independently of these pins.

| Topic | Reference version | Page |
| --- | --- | --- |
| TanStack Start | 1.169.3 | [Server functions and request boundaries](01-tanstack-start.md) |
| TanStack Router | 1.170.45 | [Routes, search, and navigation](02-tanstack-router.md) |
| Vite+ | 1.3.0 | [Build configuration](03-vite-plus.md) |
| Void | 1.1.12 | [Worker configuration](04-void.md) |
| Next.js | 16.4.2 | [Migration map](05-nextjs.md) |
| React | 19.2.8 | [Rendering and state](06-react.md) |
| OpenNext Cloudflare | 1.20.6 | [Retained Next adapter](07-opennext-cloudflare.md) |
| Wrangler | 4.151.2 and 4.152.0 in app manifests | [Provider configuration](08-wrangler-config.md) |
| Workers | Provider documentation, checked 9 November 2026 | [Runtime limits](09-workers-runtime.md) |
| Oxlint and Oxfmt | 1.89.0 and 0.74.0 | [Scoped validation](10-oxlint-oxfmt.md) |
| Migration interactions | Repository contracts | [Pitfalls](11-migration-pitfalls.md) |

The root Wrangler declaration is `^4.152.0`; Meet and Calendar retain 4.151.2.
A single global Wrangler version is not a substitute for the owning workspace's resolution.

## Architecture

The target for satellite web apps is TanStack Start with Void and Vite+ on Workers.
`apps/web` remains on Next.js until separately scheduled.
Native apps reach retained `next/*` APIs through `@tuturuuu/start-bridge`.
Some apps use its RSC integration. Others use document navigation.
OpenNext configurations are retained compatibility paths, not a second migration destination.

The [native Start migration runbook](../../../apps/docs/build/devops/native-start-migration.mdx)
owns app migration and cutover requirements.
The [Oxc and Cloudflare adoption guide](../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx)
owns operation-by-operation tool adoption.

## Reference boundaries

An API name here is a lookup aid, not a global replacement rule.
Installed declarations, first-party callers, generated app configuration, and the owning tests
resolve version-specific behavior. Generated files retain their canonical generator.
Runtime bindings and actual routing require provider readback.
An emitted Worker or successful local fixture does not establish a live cutover.
