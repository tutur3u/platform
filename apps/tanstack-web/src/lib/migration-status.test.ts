import {
  getBackendMigrationCutoverGates,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
} from '@tuturuuu/internal-api/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTanStackMigrationStatus } from './migration-status';

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
        backendOwned: 1112,
        backendRouteArtifacts: 1112,
        frontendOwned: 377,
        legacyNext: 1395,
        migrated: 93,
        total: 1489,
        unknownStatus: 0,
        unmapped: 0,
      },
      gates: [],
      generatedBy: 'scripts/tanstack-migration-manifest.js',
      manifest: 'apps/tanstack-web/migration/route-manifest.json',
      ok: false,
      summary: {
        apiRoutes: 1089,
        cronRoutes: 19,
        layouts: 67,
        methodCounts: ROUTE_METHOD_COUNTS,
        pages: 305,
        routeHandlers: 1112,
        total: 1489,
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
            legacyNext: 1099,
            migrated: 12,
            percentComplete: 1.17,
            remaining: 1099,
            terminal: 13,
            total: 1112,
            unknownStatus: 0,
          },
          {
            acceptedRemoval: 0,
            key: 'tanstack-start',
            label: 'TanStack Start',
            legacyNext: 296,
            migrated: 81,
            percentComplete: 21.49,
            remaining: 296,
            terminal: 81,
            total: 377,
            unknownStatus: 0,
          },
        ],
        topLegacyRoutes: [],
        totals: {
          acceptedRemoval: 1,
          key: 'total',
          label: 'All route artifacts',
          legacyNext: 1395,
          migrated: 93,
          percentComplete: 6.31,
          remaining: 1395,
          terminal: 94,
          total: 1489,
          unknownStatus: 0,
        },
      },
      summary: {
        apiRoutes: 1089,
        cronRoutes: 19,
        layouts: 67,
        methodCounts: ROUTE_METHOD_COUNTS,
        pages: 305,
        routeHandlers: 1112,
        total: 1489,
      },
    });

    const status = await readTanStackMigrationStatus();

    expect(status.backendReachable).toBe(true);
    expect(status.cutoverGates.counts.legacyNext).toBe(1395);
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
    expect(status.cutoverGates.summary.total).toBe(1489);
    expect(status.cutoverGates.gates[0]?.id).toBe('backend-reachable');
    expect(status.migrationProgress.progress.totals.remaining).toBe(1395);
    expect(status.errorMessage).toContain('ECONNREFUSED');
  });
});
