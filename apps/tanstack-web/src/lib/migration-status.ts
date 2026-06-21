import {
  type BackendMigrationCutoverGates,
  type BackendMigrationProgress,
  type BackendMigrationStatus,
  getBackendMigrationCutoverGates,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
} from '@tuturuuu/internal-api/backend';
import { withTanstackBackendRuntime } from './cloudflare/backend';
import { tanstackRouteManifest } from './route-manifest';

export type TanStackMigrationStatus = BackendMigrationStatus & {
  backendReachable: boolean;
  checkedAt: string;
  cutoverGates: BackendMigrationCutoverGates;
  errorMessage?: string;
  migrationProgress: BackendMigrationProgress;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isBackendRouteKind(kind: string) {
  return ['api', 'cron', 'route-handler', 'trpc'].includes(kind);
}

function fallbackCutoverGates(): BackendMigrationCutoverGates {
  const counts = tanstackRouteManifest.routes.reduce(
    (result, route) => {
      result.total += 1;

      if (route.status === 'accepted-removal') {
        result.acceptedRemoval += 1;
      } else if (route.status === 'migrated') {
        result.migrated += 1;
      } else if (route.status === 'legacy-next') {
        result.legacyNext += 1;
      } else {
        result.unknownStatus += 1;
      }

      if (route.targetOwner === 'rust-backend') {
        result.backendOwned += 1;
      } else if (route.targetOwner === 'tanstack-start') {
        result.frontendOwned += 1;
      } else {
        result.unmapped += 1;
      }

      if (isBackendRouteKind(route.kind)) {
        result.backendRouteArtifacts += 1;
      }

      return result;
    },
    {
      acceptedRemoval: 0,
      backendOwned: 0,
      backendRouteArtifacts: 0,
      frontendOwned: 0,
      legacyNext: 0,
      migrated: 0,
      total: 0,
      unknownStatus: 0,
      unmapped: 0,
    }
  );

  return {
    counts,
    gates: [
      {
        detail:
          'The TanStack server function could not reach the Rust backend cutover gate endpoint.',
        id: 'backend-reachable',
        label: 'Backend reachable',
        ok: false,
        status: 'blocked',
      },
    ],
    generatedBy: tanstackRouteManifest.generatedBy,
    manifest: 'apps/tanstack-web/migration/route-manifest.json',
    ok: false,
    summary: tanstackRouteManifest.summary,
  };
}

function fallbackMigrationProgress(): BackendMigrationProgress {
  return {
    generatedBy: tanstackRouteManifest.generatedBy,
    manifest: 'apps/tanstack-web/migration/route-manifest.json',
    ok: tanstackRouteManifest.progress.totals.remaining === 0,
    progress: tanstackRouteManifest.progress,
    summary: tanstackRouteManifest.summary,
  };
}

export async function readTanStackMigrationStatus(): Promise<TanStackMigrationStatus> {
  const checkedAt = new Date().toISOString();

  try {
    const backendOptions = await withTanstackBackendRuntime();
    const [status, cutoverGates, migrationProgress] = await Promise.all([
      getBackendMigrationStatus(backendOptions),
      getBackendMigrationCutoverGates(backendOptions),
      getBackendMigrationProgress(backendOptions),
    ]);

    return {
      ...status,
      backendReachable: true,
      checkedAt,
      cutoverGates,
      migrationProgress,
    };
  } catch (error) {
    return {
      backend: {
        deploymentTarget: 'unavailable',
        runtime: 'rust',
        service: 'backend',
        toolchain: 'unavailable',
      },
      backendReachable: false,
      checkedAt,
      contactData: {
        configured: false,
        missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        supabaseOrigin: null,
      },
      cutoverGates: fallbackCutoverGates(),
      environment: 'unavailable',
      errorMessage: getErrorMessage(error),
      frontendTargets: ['next', 'tanstack-start'],
      migrationProgress: fallbackMigrationProgress(),
      ok: false,
      routeOwnership: {
        legacyAllowed: true,
        manifest: 'apps/tanstack-web/migration/route-manifest.json',
        status: 'backend-unreachable',
      },
    };
  }
}
