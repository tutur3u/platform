import { bindings, defineConfig, exports } from 'cf/config';

// Deployment authority for GitHub Actions publishes. One SQLite Durable Object
// per catalog project environment serializes publishes; the Worker holds no
// provider credentials. No route, workers.dev URL or preview URL is published
// until release authority approves a hostname.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-deploy-coordinator',
    compatibilityDate: '2026-09-28',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
    },
    env: {
      // Global stop fence: anything other than 'true' rejects CI mutations.
      DEPLOY_COORDINATOR_ENABLED: bindings.text('true'),
      DEPLOY_COORDINATOR_OIDC_AUDIENCE: bindings.text(
        'tuturuuu-deploy-coordinator'
      ),
      // Immutable GitHub id of tutur3u/platform; survives renames and transfers.
      DEPLOY_COORDINATOR_REPOSITORY_ID: bindings.text('536896722'),
      DEPLOY_COORDINATOR_OPERATOR_TOKEN: bindings.secret(),
      DEPLOY_ENVIRONMENTS: bindings.durableObject({
        worker: 'tuturuuu-deploy-coordinator',
        exportName: 'DeployEnvironment',
      }),
    },
    exports: {
      DeployEnvironment: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
