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
          route.id ===
          'api:/api/health:apps/web/src/legacy-api-routes/health/route.ts'
      )
    ).toMatchObject({
      methods: ['GET'],
      routePath: '/api/health',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
  });

  it('marks auth preflight methods as Rust-migrated without hiding auth methods', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:OPTIONS:/api/v1/auth/mobile/password-login:apps/web/src/legacy-api-routes/v1/auth/mobile/password-login/route.ts'
      )
    ).toMatchObject({
      method: 'OPTIONS',
      methods: ['OPTIONS'],
      parentId:
        'api:/api/v1/auth/mobile/password-login:apps/web/src/legacy-api-routes/v1/auth/mobile/password-login/route.ts',
      routePath: '/api/v1/auth/mobile/password-login',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:POST:/api/v1/auth/mobile/password-login:apps/web/src/legacy-api-routes/v1/auth/mobile/password-login/route.ts'
      )
    ).toMatchObject({
      method: 'POST',
      methods: ['POST'],
      parentId:
        'api:/api/v1/auth/mobile/password-login:apps/web/src/legacy-api-routes/v1/auth/mobile/password-login/route.ts',
      routePath: '/api/v1/auth/mobile/password-login',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    });
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:OPTIONS:/api/v1/auth/qr-login/challenges/:challengeId/approve:apps/web/src/legacy-api-routes/v1/auth/qr-login/challenges/[challengeId]/approve/route.ts'
      )
    ).toMatchObject({
      method: 'OPTIONS',
      methods: ['OPTIONS'],
      parentId:
        'api:/api/v1/auth/qr-login/challenges/:challengeId/approve:apps/web/src/legacy-api-routes/v1/auth/qr-login/challenges/[challengeId]/approve/route.ts',
      routePath: '/api/v1/auth/qr-login/challenges/:challengeId/approve',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:POST:/api/v1/auth/qr-login/challenges/:challengeId/approve:apps/web/src/legacy-api-routes/v1/auth/qr-login/challenges/[challengeId]/approve/route.ts'
      )
    ).toMatchObject({
      method: 'POST',
      methods: ['POST'],
      parentId:
        'api:/api/v1/auth/qr-login/challenges/:challengeId/approve:apps/web/src/legacy-api-routes/v1/auth/qr-login/challenges/[challengeId]/approve/route.ts',
      routePath: '/api/v1/auth/qr-login/challenges/:challengeId/approve',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    });
  });

  it('marks the WebGL upload preflight as Rust-migrated without hiding upload PUT', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:OPTIONS:/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload:apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route.ts'
      )
    ).toMatchObject({
      method: 'OPTIONS',
      methods: ['OPTIONS'],
      parentId:
        'api:/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload:apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route.ts',
      routePath:
        '/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:PUT:/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload:apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route.ts'
      )
    ).toMatchObject({
      method: 'PUT',
      methods: ['PUT'],
      parentId:
        'api:/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload:apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route.ts',
      routePath:
        '/api/v1/workspaces/:wsId/external-projects/webgl-packages/upload',
      status: 'legacy-next',
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

  it('marks the Serwist decommission route as Rust-migrated', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'route-handler:/serwist/:path:apps/web/src/app/serwist/[path]/route.ts'
      )
    ).toMatchObject({
      methods: ['GET'],
      routePath: '/serwist/:path',
      status: 'migrated',
      targetOwner: 'rust-backend',
    });
  });

  it('accepts removal for empty legacy route artifacts', () => {
    expect(
      tanstackRouteManifest.routes.find(
        (route) =>
          route.id ===
          'api:/api/workspaces/:wsId/categories:apps/web/src/legacy-api-routes/workspaces/[wsId]/categories/route.ts'
      )
    ).toMatchObject({
      methods: [],
      routePath: '/api/workspaces/:wsId/categories',
      status: 'accepted-removal',
      targetOwner: 'rust-backend',
    });
  });
});
