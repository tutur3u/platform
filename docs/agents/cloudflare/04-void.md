# Void 1.1.12

Void integrates with Vite through `voidPlugin()`.
`void.config.ts` imports `defineConfig` from `void/config`.
The installed package includes `docs/reference/config.md` and configuration declarations.
Those versioned files are the reference for accepted options.

## Worker configuration

The checked Tools configuration uses `target: 'cloudflare'` and `remote: false`.
Its `cloudflare` object supplies the Worker entrypoint, compatibility settings,
assets, observability, and the selected deployment profile.

Tools selects its profile with `VITE_TOOLS_NATIVE_PROFILE` through
`cloudflare/deployment-profile.mjs`.
The resulting configuration keeps `workers_dev: false` and `preview_urls: false`.
Its production profile does not attach a public route.
These values describe the checked source, not an assertion about live provider state.

The `ASSETS` binding points at `dist/client` with `run_worker_first: true`.
The Worker entrypoint remains the app's `cloudflare/worker.ts`.
A generic generated entrypoint does not replace the app's startup or dispatch guards.

## Resource and deployment effects

Void supports resource configuration and deployment operations.
A configuration field or command can have effects beyond bundling JavaScript.
The installed schema determines which Cloudflare options are accepted.
Wrangler configuration keys are not assumed to be universally interchangeable with Void options.

Existing resource identifiers, migration history, binding names, and provider profiles
remain attached to the owning app.
Configuration migration or resource inference is a separate operation.
Local configuration success does not authorize resource creation or a database migration.

Sources: [Void documentation](https://void.cloud/),
[Tools configuration](../../../apps/tools/void.config.ts),
[Deployment profiles](../../../apps/tools/cloudflare/deployment-profile.mjs),
[Native Start runbook](../../../apps/docs/build/devops/native-start-migration.mdx).
