import { bindings, defineConfig } from 'cf/config';

// tuturuuu-workspace-secrets: the only holder of the credential-tier KEK
// (apps/docs/platform/architecture/workspace-secrets-encryption.mdx). It has
// no public route: workers.dev, preview URLs and routes stay off, and callers
// reach it only through service bindings to a named entrypoint
// (`bindings.worker({ worker, exportName })`), which selects that caller's
// allowlist: WebSecrets, AdminSecrets, StorageSecrets or KeyStatusSecrets. Not yet published; secrets are provisioned by the
// release authority, never in this file.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-workspace-secrets',
    compatibilityDate: '2026-09-28',
    compatibilityFlags: ['global_fetch_strictly_public'],
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      // Invocation logs stay off: request metadata is never logged here.
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: false },
    },
    env: {
      SUPABASE_URL: bindings.secret(),
      SUPABASE_SECRET_KEY: bindings.secret(),
      WORKSPACE_SECRETS_KEK_ACTIVE_VERSION: bindings.text('1'),
      WORKSPACE_SECRETS_KEK_V1: bindings.secret(),
    },
  },
});
