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

Do not add Serwist packages directly to applications. Extend the internal rule
types and runtime here so cache behavior remains reviewable, testable, and
versioned with the platform.
