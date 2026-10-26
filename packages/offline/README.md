# `@tuturuuu/offline`

Tuturuuu owns its offline runtime end to end. This package provides:

- `OfflineProvider` for deduplicated browser registration;
- `createOfflineWorker` for precaching, navigation fallback, and runtime cache
  strategies;
- `createOfflineRoute` for manifest generation and esbuild-based worker
  compilation; and
- `getOfflineTurbopackConfig` for required `esbuild-wasm` tracing.

The public worker URL remains `/serwist/sw.js` for compatibility with existing
browser registrations. The name is a stable legacy URL, not an external runtime
dependency.

## Cache namespaces

Every app that shares an origin (for example `tuturuuu.com/<app>`) must pass its
own `cacheNamespace` to `createOfflineWorker`. Precache and runtime cache names
start with it, and activation prunes stale precaches only within that
namespace, so one app's update never deletes another app's offline assets or
runtime entries. Web keeps the default `tuturuuu-offline`, its original cache
names, so existing installs keep their caches. Changing an app's namespace
leaves its old caches behind on that origin.

Do not add Serwist packages directly to applications. Extend the internal rule
types and runtime here so cache behavior remains reviewable, testable, and
versioned with the platform.
