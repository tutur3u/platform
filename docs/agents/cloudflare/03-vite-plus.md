# Vite+ 1.3.0

Migrated app manifests use `vite-plus` 1.3.0 and alias `vite` to
`npm:@voidzero-dev/vite-plus-core@1.3.0`.
The workspace lock determines the actual dependency graph.

## App configuration

Native app configuration lives in `vite.config.mts`.
The checked Apps and Tools configurations import `defineConfig` from `vite-plus`,
`tanstackStart` from `@tanstack/react-start/plugin/vite`, and `voidPlugin` from `void`.
They retain the app's `startBridgePreset` configuration.

Tools also uses `startBridgeRscPlugin`, `startBridgeNodeBuiltinsPlugin`, and
`@vitejs/plugin-rsc`. Plugin order and environment-specific definitions are part
of the working configuration, rather than interchangeable starter boilerplate.

`base`, aliases, and client definitions come from the bridge preset.
A hard-coded root base can break an app mounted below the main domain.
A browser definition must not contain private runtime bindings or secret values.

## Commands and scope

The owning `package.json` supplies the supported entrypoints.
For example, Tools maps its native build to `vp build --configLoader runner` and
retains `build:legacy` for the Next path.
Those scripts describe different artifacts.

A Vite build does not replace the owning TypeScript check, focused tests,
or emitted-Worker acceptance.
The repository's Oxc wrappers own scoped formatting and linting.
Global installation and `vp migrate` are not prerequisites for reading this reference.
A tool migration can rewrite configuration and requires its own scoped change.

Sources: [Vite+ documentation](https://viteplus.dev/guide/),
[Apps configuration](../../../apps/apps/vite.config.mts),
[Tools configuration](../../../apps/tools/vite.config.mts),
[Tooling adoption](../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx).
