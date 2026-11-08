# Migration pitfalls

These interactions require app-specific evidence during a native Start migration.
The [native Start runbook](../../../apps/docs/build/devops/native-start-migration.mdx)
remains the delivery procedure.

## Build and runtime identity

A Next build, OpenNext build, and native Start build produce different artifacts.
An emitted Worker must correspond to the app, profile, source, and bindings under test.
A fixture build with public inputs is not a production deployment artifact.

RSC is present in some start-bridge apps.
Removing its plugins or treating all retained server modules as ordinary client imports
can expose server-only dependencies or break rendering.

A Node compatibility flag does not make every Node API functional.
Installed code and real Worker tests resolve whether the required operation works.
Configured vars can populate `process.env`; a missing value still needs explicit handling.

## Routing and data

The bridge preset supplies base paths and request adapters.
Tests cover both the app subdomain and its path below the main domain where applicable.
A catch-all page can consume API requests before a fallback proxy handles them.
Route composition therefore includes API paths as well as page navigation.

Router invalidation, TanStack Query invalidation, and provider cache invalidation
have different scopes. Private data must not enter a shared cache by accident.
A migration preserves existing actor, workspace, cookie, and permission boundaries.

Image optimization depends on the owning adapter and provider configuration.
Replacing a component must preserve media access, dimensions, and caching behavior.
Signed or private media must not become a public optimization input.

## Resources and side effects

A local binding, generated config, or successful upload does not prove live routing.
Existing resource identifiers and migration history remain attached to their app.
Missing identifiers do not authorize automatic resource creation.

Billable work requires bounded retries, idempotent progress, terminal scheduling,
and a tested durable stop fence under the existing adoption policy.
Ingress rate limits, alerts, and per-invocation CPU limits do not bound total spend.
A runtime compatibility change does not authorize database or provider mutations.

Sources: [Start bridge](../../../packages/start-bridge),
[Workers runtime](09-workers-runtime.md),
[Tooling adoption](../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx).
