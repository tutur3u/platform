import { bindings, defineConfig, exports } from 'cf/config';

// Secrets vault witness. Not published: it deploys from a dedicated
// Cloudflare account whose credentials the vault API never holds, so this
// config names no account, route, workers.dev or preview URL. See
// apps/docs/platform/architecture/secrets-vault-witness.mdx.
export default defineConfig({
  worker: {
    name: 'tuturuuu-vault-witness',
    compatibilityDate: '2026-10-19',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: false },
    },
    limits: { cpuMs: 1000 },
    env: {
      WITNESS_DEPLOYMENT: bindings.text('tuturuuu.com'),
      // `<generation>:<base64url Ed25519 seed>`; clients pin each generation's
      // public key in their build.
      WITNESS_SIGNING_KEY: bindings.secret(),
      WITNESS_API_TOKEN: bindings.secret(),
      // Stop fence: "true" fails every vault and keyring call closed. A secret,
      // so operators flip it without a code deploy.
      WITNESS_STOPPED: bindings.secret(),
      VAULT_WITNESS: bindings.durableObject({
        worker: 'tuturuuu-vault-witness',
        exportName: 'VaultWitness',
      }),
      KEYRING_WITNESS: bindings.durableObject({
        worker: 'tuturuuu-vault-witness',
        exportName: 'KeyringWitness',
      }),
    },
    exports: {
      VaultWitness: exports.durableObject({ storage: 'sqlite' }),
      KeyringWitness: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
