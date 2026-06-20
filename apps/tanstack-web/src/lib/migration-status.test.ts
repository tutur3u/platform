import {
  getBackendMigrationCutoverGates,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
} from '@tuturuuu/internal-api/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTanStackMigrationStatus } from './migration-status';
import { tanstackRouteManifest } from './route-manifest';

vi.mock('@tuturuuu/internal-api/backend', () => ({
  getBackendMigrationCutoverGates: vi.fn(),
  getBackendMigrationProgress: vi.fn(),
  getBackendMigrationStatus: vi.fn(),
}));

const ROUTE_METHOD_COUNTS = {
  DELETE: 193,
  GET: 634,
  HEAD: 1,
  OPTIONS: 16,
  PATCH: 122,
  POST: 504,
  PUT: 173,
};

describe('readTanStackMigrationStatus', () => {
  beforeEach(() => {
    vi.mocked(getBackendMigrationCutoverGates).mockReset();
    vi.mocked(getBackendMigrationProgress).mockReset();
    vi.mocked(getBackendMigrationStatus).mockReset();
  });

  it('combines backend status and cutover gates when reachable', async () => {
    vi.mocked(getBackendMigrationStatus).mockResolvedValue({
      backend: {
        deploymentTarget: 'container',
        runtime: 'rust',
        service: 'backend',
        toolchain: 'rustc 1.95.0',
      },
      contactData: {
        configured: false,
        missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        supabaseOrigin: null,
      },
      environment: 'test',
      frontendTargets: ['next', 'tanstack-start'],
      ok: true,
      routeOwnership: {
        legacyAllowed: true,
        manifest: 'apps/tanstack-web/migration/route-manifest.json',
        status: 'migration-foundation',
      },
    });
    vi.mocked(getBackendMigrationCutoverGates).mockResolvedValue({
      counts: {
        acceptedRemoval: 1,
        backendOwned: 1128,
        backendRouteArtifacts: 1128,
        frontendOwned: 377,
        legacyNext: 1369,
        migrated: 135,
        total: 1505,
        unknownStatus: 0,
        unmapped: 0,
      },
      gates: [],
      generatedBy: 'scripts/tanstack-migration-manifest.js',
      manifest: 'apps/tanstack-web/migration/route-manifest.json',
      ok: false,
      summary: {
        apiRoutes: 1105,
        cronRoutes: 19,
        layouts: 67,
        methodCounts: ROUTE_METHOD_COUNTS,
        pages: 305,
        routeHandlers: 1128,
        total: 1505,
      },
    });
    vi.mocked(getBackendMigrationProgress).mockResolvedValue({
      generatedBy: 'scripts/tanstack-migration-manifest.js',
      manifest: 'apps/tanstack-web/migration/route-manifest.json',
      ok: false,
      progress: {
        byKind: [],
        byOwner: [
          {
            acceptedRemoval: 1,
            key: 'rust-backend',
            label: 'Rust backend',
            legacyNext: 1098,
            migrated: 29,
            percentComplete: 2.66,
            remaining: 1098,
            terminal: 30,
            total: 1128,
            unknownStatus: 0,
          },
          {
            acceptedRemoval: 0,
            key: 'tanstack-start',
            label: 'TanStack Start',
            legacyNext: 271,
            migrated: 106,
            percentComplete: 28.12,
            remaining: 271,
            terminal: 106,
            total: 377,
            unknownStatus: 0,
          },
        ],
        topLegacyRoutes: [],
        totals: {
          acceptedRemoval: 1,
          key: 'total',
          label: 'All route artifacts',
          legacyNext: 1369,
          migrated: 135,
          percentComplete: 9.04,
          remaining: 1369,
          terminal: 136,
          total: 1505,
          unknownStatus: 0,
        },
      },
      summary: {
        apiRoutes: 1105,
        cronRoutes: 19,
        layouts: 67,
        methodCounts: ROUTE_METHOD_COUNTS,
        pages: 305,
        routeHandlers: 1128,
        total: 1505,
      },
    });

    const status = await readTanStackMigrationStatus();

    expect(status.backendReachable).toBe(true);
    expect(status.cutoverGates.counts.legacyNext).toBe(1369);
    expect(status.migrationProgress.progress.byOwner[0]?.key).toBe(
      'rust-backend'
    );
  });

  it('keeps a manifest-backed fallback when the backend is offline', async () => {
    vi.mocked(getBackendMigrationStatus).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );
    vi.mocked(getBackendMigrationCutoverGates).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );
    vi.mocked(getBackendMigrationProgress).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );

    const status = await readTanStackMigrationStatus();

    expect(status.backendReachable).toBe(false);
    expect(status.cutoverGates.summary.total).toBe(
      tanstackRouteManifest.summary.total
    );
    expect(status.cutoverGates.gates[0]?.id).toBe('backend-reachable');
    expect(status.migrationProgress.progress.totals.remaining).toBe(
      tanstackRouteManifest.progress.totals.remaining
    );
    expect(status.errorMessage).toContain('ECONNREFUSED');
  });
});
