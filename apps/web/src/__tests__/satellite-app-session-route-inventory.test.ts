import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

const satelliteRouteRoots = [
  'apps/web/src/app/api/v1/tulearn',
  'apps/web/src/app/api/v1/course',
  'apps/web/src/app/api/v1/workspaces/[wsId]/tulearn',
  'apps/web/src/app/api/v1/workspaces/[wsId]/users/groups',
  'apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar-settings',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar-hours',
  'apps/web/src/app/api/v1/workspaces/[wsId]/encryption',
  'apps/web/src/app/api/v1/workspaces/[wsId]/storage',
  'apps/web/src/app/api/v1/workspaces/[wsId]/inventory',
  'apps/web/src/app/api/v1/workspaces/[wsId]/mind',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/modules',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-order',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups',
  'apps/web/src/app/api/v1/users/me/profile',
  'apps/web/src/app/api/v1/users/me/avatar',
  'apps/web/src/app/api/v1/users/me/email',
];

const satelliteAppApiRoots = [
  'apps/learn/src/app/api',
  'apps/teach/src/app/api',
  'apps/inventory/src/app/api',
  'apps/drive/src/app/api',
  'apps/mind/src/app/api',
];

const allowedSatelliteLocalApiRoutes = new Set([
  'apps/learn/src/app/api/auth/logout/route.ts',
  'apps/learn/src/app/api/auth/verify-app-token/route.ts',
  'apps/teach/src/app/api/auth/logout/route.ts',
  'apps/teach/src/app/api/auth/verify-app-token/route.ts',
  'apps/inventory/src/app/api/auth/logout/route.ts',
  'apps/inventory/src/app/api/auth/verify-app-token/route.ts',
  'apps/drive/src/app/api/auth/logout/route.ts',
  'apps/drive/src/app/api/auth/verify-app-token/route.ts',
  'apps/mind/src/app/api/auth/logout/route.ts',
  'apps/mind/src/app/api/auth/verify-app-token/route.ts',
]);

function walkRouteFiles(relativePath: string): string[] {
  const absolutePath = resolve(repoRoot, relativePath);

  if (!existsSync(absolutePath)) return [];

  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    return absolutePath.endsWith('/route.ts') ? [absolutePath] : [];
  }

  return readdirSync(absolutePath)
    .flatMap((entry) => walkRouteFiles(join(relativePath, entry)))
    .filter((file) => file.endsWith('/route.ts'));
}

function relative(file: string) {
  return file.replace(`${repoRoot}/`, '');
}

describe('satellite app-session route inventory', () => {
  it('keeps satellite-consumed withSessionAuth routes opted into app-session auth', () => {
    const failures = satelliteRouteRoots
      .flatMap(walkRouteFiles)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const wrapperCount = (
          source.match(/export\s+const\s+\w+\s*=\s*withSessionAuth/g) ?? []
        ).length;

        if (wrapperCount === 0) return [];

        const optInCount = (
          source.match(/allowAppSessionAuth:\s*(?:true|[A-Z][A-Z0-9_]*)/g) ?? []
        ).length;

        return optInCount >= wrapperCount
          ? []
          : [
              `${relative(file)} has ${wrapperCount} withSessionAuth export(s) but ${optInCount} app-session opt-in(s)`,
            ];
      });

    expect(failures).toEqual([]);
  });

  it('keeps legacy satellite-consumed route handlers on the app-session-aware auth helper', () => {
    const failures = satelliteRouteRoots
      .flatMap(walkRouteFiles)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const usesLegacyAuth =
          source.includes('resolveAuthenticatedSessionUser') ||
          source.includes('.auth.getUser(');

        return usesLegacyAuth
          ? [
              `${relative(file)} still resolves Supabase sessions directly instead of resolveSessionAuthContext(..., { allowAppSessionAuth: true })`,
            ]
          : [];
      });

    expect(failures).toEqual([]);
  });

  it('keeps CMS external project access available to app-session cookies', () => {
    const source = readFileSync(
      resolve(repoRoot, 'apps/web/src/lib/external-projects/access.ts'),
      'utf8'
    );

    expect(source).toContain('getAppSessionTokenFromRequest');
    expect(source).toContain('verifyAppSessionRequest');
  });

  it('keeps Inventory workspace APIs on the inventory app-session target', () => {
    const source = readFileSync(
      resolve(repoRoot, 'apps/web/src/lib/inventory/commerce/auth.ts'),
      'utf8'
    );

    expect(source).toContain('resolveSessionAuthContext');
    expect(source).toContain("targetApp: 'inventory'");
  });

  it('keeps satellite local APIs limited to auth cookie handoff routes', () => {
    const unexpectedRoutes = satelliteAppApiRoots
      .flatMap(walkRouteFiles)
      .map(relative)
      .filter((file) => !allowedSatelliteLocalApiRoutes.has(file));

    expect(unexpectedRoutes).toEqual([]);
  });

  it('keeps satellite browser logout routes redirecting after local cleanup', () => {
    for (const file of [
      'apps/learn/src/app/api/auth/logout/route.ts',
      'apps/teach/src/app/api/auth/logout/route.ts',
      'apps/inventory/src/app/api/auth/logout/route.ts',
      'apps/mind/src/app/api/auth/logout/route.ts',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toContain('createAppSessionLogoutResponse');
      expect(source, file).toContain("new URL('/logout'");
    }
  });

  it('keeps satellite token verifiers on the central Web verifier path', () => {
    for (const file of [
      'apps/learn/src/app/api/auth/verify-app-token/route.ts',
      'apps/teach/src/app/api/auth/verify-app-token/route.ts',
      'apps/inventory/src/app/api/auth/verify-app-token/route.ts',
      'apps/mind/src/app/api/auth/verify-app-token/route.ts',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toContain('import { WEB_APP_URL }');
      expect(source, file).toContain('verificationBaseUrl: WEB_APP_URL');
    }
  });

  it('keeps Learn and Teach local auth routes covered by the generic API proxy guard', () => {
    for (const { app, proxyFile, testFile } of [
      {
        app: 'learn',
        proxyFile: 'apps/learn/src/proxy.ts',
        testFile: 'apps/learn/src/proxy.test.ts',
      },
      {
        app: 'teach',
        proxyFile: 'apps/teach/src/proxy.ts',
        testFile: 'apps/teach/src/proxy.test.ts',
      },
    ]) {
      const proxySource = readFileSync(resolve(repoRoot, proxyFile), 'utf8');
      const testSource = readFileSync(resolve(repoRoot, testFile), 'utf8');

      expect(proxySource, proxyFile).toContain('guardApiProxyRequest');
      expect(proxySource, proxyFile).toContain(
        `prefixBase: 'proxy:${app}:api'`
      );
      expect(proxySource, proxyFile).not.toContain('LOCAL_AUTH_API_PATHS');
      expect(testSource, testFile).toContain("'/api/auth/logout'");
      expect(testSource, testFile).toContain("'/api/auth/verify-app-token'");
    }
  });

  it('keeps education dashboard entry pages from redirect-looping authenticated users', () => {
    for (const file of [
      'apps/learn/src/app/[locale]/dashboard/page.tsx',
      'apps/teach/src/app/[locale]/dashboard/page.tsx',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      const loginRedirectIndex = source.indexOf(
        "redirect({ href: '/login?next=/dashboard'"
      );
      const bootstrapIndex = source.indexOf('getTulearnBootstrap(');

      expect(source, file).toContain('getAppSessionClaimsFromRequest');
      expect(source, file).toContain('hasWebAppSessionTokenFromRequest');
      expect(loginRedirectIndex, file).toBeGreaterThanOrEqual(0);
      expect(bootstrapIndex, file).toBeGreaterThan(loginRedirectIndex);
      expect(source, file).toMatch(
        /return <No(?:Workspace|TeachWorkspace)State/u
      );
    }
  });

  it('keeps Learn and Teach stale local app-session cookies on the platform-login recovery path', () => {
    for (const file of [
      'apps/learn/src/proxy.ts',
      'apps/teach/src/proxy.ts',
      'apps/learn/src/app/[locale]/(auth)/login/page.tsx',
      'apps/teach/src/app/[locale]/login/page.tsx',
      'apps/learn/src/app/[locale]/page.tsx',
      'apps/teach/src/app/[locale]/page.tsx',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toContain('hasWebAppSessionTokenFromRequest');
    }
  });
});
