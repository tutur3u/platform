# Satellite public documents

Authenticated applications retain the default exports, `Providers`,
`ClientProviders`, app-session actors and route guards. Public documents opt in
with `@tuturuuu/satellite/public`; do not import the default barrel for public SSR.

`PublicSatelliteShell` renders the shared UI brand and logo, navigation and an
optional sign-in link. Inject `LinkComponent` and `ImageComponent` at the framework
adapter. The default adapters use native anchors and images. The shell never
resolves an actor or mounts account, workspace or authentication providers.
`PublicSatelliteProviders` supplies only the shared system/light/dark theme.
Locale labels are explicit props; no cookie or request locale is resolved.

Import `@tuturuuu/ui/globals.css` and
`@tuturuuu/satellite/public/styles.css` through the owning app's configured
Tailwind processor. Include satellite/UI source in CSS scanning. Keep styling
and framework adapters outside the portable public entry.

Roadmap is the public adoption surface. Its document contains only the public
snapshot; sign-in navigates to the central platform. Per-user content requires a
separate private, no-store endpoint and is outside this entry's contract.

Cheap source regressions:

```sh
node --test packages/satellite/tests/public-boundary.node-test.mjs
node --test apps/roadmap/src/cache-policy.test.ts apps/roadmap/src/roadmap-data.test.ts
```

The source graph check traverses first-party exports and fences external imports.
It does not inspect emitted third-party bundles. With installed frozen workspace
dependencies, run the owning Vitest SSR regression
`src/components/public-satellite-shell.test.tsx`, then exact-commit CI type, lint
and real app build gates. Inspect the emitted document graph for auth SDKs during
artifact acceptance; source graph checks alone do not prove bundle contents.
