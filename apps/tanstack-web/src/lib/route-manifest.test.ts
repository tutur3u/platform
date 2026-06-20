import { describe, expect, it } from 'vitest';
import { tanstackRouteManifest } from './route-manifest';

describe('tanstackRouteManifest', () => {
  it('tracks the checked legacy route inventory', () => {
    expect(tanstackRouteManifest.summary.pages).toBeGreaterThan(0);
    expect(tanstackRouteManifest.summary.layouts).toBeGreaterThan(0);
    expect(tanstackRouteManifest.summary.routeHandlers).toBeGreaterThan(0);
    expect(tanstackRouteManifest.summary.total).toBe(
      tanstackRouteManifest.routes.length
    );
    expect(tanstackRouteManifest.progress.totals.total).toBe(
      tanstackRouteManifest.summary.total
    );
    expect(tanstackRouteManifest.progress.totals.remaining).toBeGreaterThan(0);
    expect(tanstackRouteManifest.summary.methodCounts.GET).toBeGreaterThan(0);
    expect(tanstackRouteManifest.summary.methodCounts.POST).toBeGreaterThan(0);
  });

  it('routes backend-owned handlers to the Rust backend', () => {
    expect(
      tanstackRouteManifest.routes.some(
        (route) =>
          route.targetOwner === 'rust-backend' &&
          ['api', 'cron', 'route-handler', 'trpc'].includes(route.kind)
      )
    ).toBe(true);
  });

  it('marks the legacy health route as Rust-migrated', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id === 'api:/api/health:apps/web/src/app/api/health/route.ts'
      )
    ).toMatchObject({
      methods: ['GET'],
      routePath: '/api/health',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
  });

  it('marks the .well-known catch-all route as Rust-migrated', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'route-handler:/.well-known/*slug:apps/web/src/app/.well-known/[...slug]/route.ts'
      )
    ).toMatchObject({
      methods: ['GET', 'HEAD'],
      routePath: '/.well-known/*slug',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
  });

  it('records generated Serwist route methods without marking it migrated', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'route-handler:/serwist/:path:apps/web/src/app/serwist/[path]/route.ts'
      )
    ).toMatchObject({
      methods: ['GET'],
      routePath: '/serwist/:path',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    });
  });

  it('accepts removal for empty legacy route artifacts', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:/api/workspaces/:wsId/categories:apps/web/src/app/api/workspaces/[wsId]/categories/route.ts'
      )
    ).toMatchObject({
      methods: [],
      routePath: '/api/workspaces/:wsId/categories',
      status: 'accepted-removal',
      targetOwner: 'rust-backend',
    });
  });
});
