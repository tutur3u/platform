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
  // Calendar routes migrated to the dedicated calendar app (apps/calendar).
  'apps/web/src/app/api/v1/workspaces/[wsId]/chat',
  'apps/web/src/app/api/v1/workspaces/[wsId]/encryption',
  'apps/web/src/app/api/v1/workspaces/[wsId]/storage',
  'apps/web/src/app/api/v1/workspaces/[wsId]/inventory',
  'apps/web/src/app/api/v1/workspaces/[wsId]/mail',
  // Mind routes migrated to the dedicated mind app (apps/mind).
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
  'apps/chat/src/app/api',
  'apps/inventory/src/app/api',
  'apps/drive/src/app/api',
  'apps/mail/src/app/api',
  'apps/meet/src/app/api',
  // apps/mind now owns its migrated mind API routes; it is no longer a
  // thin proxy-only satellite, so it is excluded from the local-API allowlist.
];

const registeredSatelliteApps = [
  'calendar',
  'tasks',
  'mail',
  'learn',
  'teach',
  'inventory',
  'chat',
  'mind',
  'hive',
  'drive',
  'finance',
  'cms',
  'rewise',
  'track',
  'nova',
  'meet',
] as const;

const coordinatedCookieApps = [
  'learn',
  'teach',
  'inventory',
  'chat',
  'mind',
  'hive',
] as const;

const supabaseFirstCookieApps = registeredSatelliteApps;

const allowedSatelliteLocalApiRoutes = new Set([
  'apps/learn/src/app/api/auth/logout/route.ts',
  'apps/learn/src/app/api/auth/refresh-app-session/route.ts',
  'apps/learn/src/app/api/auth/verify-app-token/route.ts',
  'apps/teach/src/app/api/auth/logout/route.ts',
  'apps/teach/src/app/api/auth/refresh-app-session/route.ts',
  'apps/teach/src/app/api/auth/verify-app-token/route.ts',
  'apps/chat/src/app/api/auth/logout/route.ts',
  'apps/chat/src/app/api/auth/refresh-app-session/route.ts',
  'apps/chat/src/app/api/auth/verify-app-token/route.ts',
  'apps/inventory/src/app/api/auth/logout/route.ts',
  'apps/inventory/src/app/api/auth/refresh-app-session/route.ts',
  'apps/inventory/src/app/api/auth/verify-app-token/route.ts',
  'apps/drive/src/app/api/auth/logout/route.ts',
  'apps/drive/src/app/api/auth/refresh-app-session/route.ts',
  'apps/drive/src/app/api/auth/verify-app-token/route.ts',
  'apps/mail/src/app/api/auth/logout/route.ts',
  'apps/mail/src/app/api/auth/refresh-app-session/route.ts',
  'apps/mail/src/app/api/auth/verify-app-token/route.ts',
  'apps/meet/src/app/api/auth/logout/route.ts',
  'apps/meet/src/app/api/auth/refresh-app-session/route.ts',
  'apps/meet/src/app/api/auth/verify-app-token/route.ts',
  'apps/mind/src/app/api/auth/logout/route.ts',
  'apps/mind/src/app/api/auth/refresh-app-session/route.ts',
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

  it('keeps Inventory workspace APIs on the inventory app-session target by default', () => {
    const source = readFileSync(
      resolve(repoRoot, 'apps/web/src/lib/inventory/commerce/auth.ts'),
      'utf8'
    );
    const actorSource = readFileSync(
      resolve(repoRoot, 'apps/web/src/lib/inventory/actor.ts'),
      'utf8'
    );

    expect(source).toContain('resolveSessionAuthContext');
    expect(source).toContain(
      "targetApp: options.appSessionTargets ?? ['inventory']"
    );
    expect(source).not.toContain("targetApp: ['inventory', 'finance']");
    expect(actorSource).toContain("targetApp: 'inventory'");
    expect(actorSource).not.toContain("targetApp: ['inventory', 'finance']");
  });

  it('limits Finance app-session access to invoice product lookup routes', () => {
    const productsRoute = readFileSync(
      resolve(
        repoRoot,
        'apps/web/src/app/api/v1/workspaces/[wsId]/inventory/products/route.ts'
      ),
      'utf8'
    );
    const broadFinanceTargets = satelliteRouteRoots
      .flatMap(walkRouteFiles)
      .map(relative)
      .filter((file) => file.includes('/inventory/'))
      .filter(
        (file) =>
          file !==
          'apps/web/src/app/api/v1/workspaces/[wsId]/inventory/products/route.ts'
      )
      .filter((file) =>
        readFileSync(resolve(repoRoot, file), 'utf8').includes("'finance'")
      );

    expect(productsRoute).toContain(
      "appSessionTargets: ['inventory', 'finance']"
    );
    expect(
      productsRoute.match(/appSessionTargets:\s*\['inventory', 'finance'\]/g)
    ).toHaveLength(1);
    expect(broadFinanceTargets).toEqual([]);
  });

  it('keeps workspace storage app-session targets route scoped', () => {
    const routeAuthSource = readFileSync(
      resolve(
        repoRoot,
        'apps/web/src/app/api/v1/workspaces/[wsId]/storage/route-auth.ts'
      ),
      'utf8'
    );
    const apiAuthSource = readFileSync(
      resolve(repoRoot, 'apps/web/src/lib/api-auth.ts'),
      'utf8'
    );
    const storageRouteFiles = walkRouteFiles(
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage'
    );
    const financeTargetRoutes = storageRouteFiles
      .map(relative)
      .filter((file) =>
        readFileSync(resolve(repoRoot, file), 'utf8').includes(
          'FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS'
        )
      )
      .sort();
    const financeStorageAccessRoutes = storageRouteFiles
      .map(relative)
      .filter((file) =>
        readFileSync(resolve(repoRoot, file), 'utf8').includes(
          'canAccessFinanceTransactionStoragePath'
        )
      )
      .sort();

    expect(apiAuthSource).toContain(
      'pattern: /^\\/api\\/v1\\/workspaces\\/[^/]+\\/storage(?:\\/|$)/u,'
    );
    expect(routeAuthSource).toContain(
      "targetApp: options.appSessionTargets ?? 'drive'"
    );
    expect(routeAuthSource).not.toContain('ALL_SATELLITE_APP_SESSION_TARGETS');
    expect(financeTargetRoutes).toEqual([
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/finalize-upload/route.ts',
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/list/route.ts',
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/object/[id]/route.ts',
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/object/route.ts',
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/share/route.ts',
      'apps/web/src/app/api/v1/workspaces/[wsId]/storage/upload-url/route.ts',
    ]);
    expect(financeTargetRoutes).toEqual(financeStorageAccessRoutes);
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
      'apps/chat/src/app/api/auth/logout/route.ts',
      'apps/inventory/src/app/api/auth/logout/route.ts',
      'apps/mind/src/app/api/auth/logout/route.ts',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toContain('createAppSessionLogoutResponse');
      expect(source, file).toContain("new URL('/logout'");
    }
  });

  it('keeps satellite token verifiers on the central Web verifier path', () => {
    for (const app of registeredSatelliteApps) {
      const file = `apps/${app}/src/app/api/auth/verify-app-token/route.ts`;
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toMatch(/import \{ (?:TTR_URL|WEB_APP_URL) \}/u);
      expect(source, file).toMatch(
        /verificationBaseUrl:\s*(?:TTR_URL|WEB_APP_URL)/u
      );
    }
  });

  it('keeps registered satellite apps on local token refresh and proxy handoff wiring', () => {
    for (const app of registeredSatelliteApps) {
      const refreshFile = `apps/${app}/src/app/api/auth/refresh-app-session/route.ts`;
      const refreshSource = readFileSync(
        resolve(repoRoot, refreshFile),
        'utf8'
      );
      const proxyFile = `apps/${app}/src/proxy.ts`;
      const proxySource = readFileSync(resolve(repoRoot, proxyFile), 'utf8');

      expect(refreshSource, refreshFile).toContain('createRefreshPOST');
      expect(refreshSource, refreshFile).toMatch(
        /verificationBaseUrl:\s*(?:TTR_URL|WEB_APP_URL)/u
      );
      expect(proxySource, proxyFile).toContain('consumeVerifyTokenRequest');
      expect(proxySource, proxyFile).toContain('refreshAppSessionForRequest');
    }
  });

  it('keeps coordinated-cookie apps refreshing missing Web sessions locally', () => {
    for (const app of coordinatedCookieApps) {
      const proxyFile = `apps/${app}/src/proxy.ts`;
      const proxySource = readFileSync(resolve(repoRoot, proxyFile), 'utf8');

      expect(proxySource, proxyFile).toContain('requireWebAppSession: true');
    }
  });

  it('keeps registered satellite apps on Supabase-first auth', () => {
    for (const app of supabaseFirstCookieApps) {
      const proxyFile = `apps/${app}/src/proxy.ts`;
      const proxySource = readFileSync(resolve(repoRoot, proxyFile), 'utf8');

      expect(proxySource, proxyFile).toMatch(
        /sessionMode:\s*["']supabase-first["']/u
      );
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
      expect(proxySource, proxyFile).toContain('refreshAppSessionForRequest');
      expect(proxySource, proxyFile).toMatch(
        new RegExp(`prefixBase:\\s*["']proxy:${app}:api["']`, 'u')
      );
      expect(proxySource, proxyFile).not.toContain('LOCAL_AUTH_API_PATHS');
      expect(testSource, testFile).toMatch(/["']\/api\/auth\/logout["']/u);
      expect(testSource, testFile).toMatch(
        /["']\/api\/auth\/refresh-app-session["']/u
      );
      expect(testSource, testFile).toMatch(
        /["']\/api\/auth\/verify-app-token["']/u
      );
    }
  });

  it('keeps education dashboard entry pages from redirect-looping authenticated users', () => {
    for (const file of [
      'apps/learn/src/app/[locale]/dashboard/page.tsx',
      'apps/teach/src/app/[locale]/dashboard/page.tsx',
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      const sessionIndex = source.indexOf('getSatelliteAppSession(');
      const loginRedirectIndex = source.search(
        /href:\s*['"]\/login\?next=\/dashboard['"]/u
      );
      const bootstrapIndex = source.indexOf('getTulearnBootstrap(');

      expect(source, file).toContain('getSatelliteAppSession');
      expect(sessionIndex, file).toBeGreaterThanOrEqual(0);
      expect(loginRedirectIndex, file).toBeGreaterThanOrEqual(0);
      expect(loginRedirectIndex, file).toBeGreaterThan(sessionIndex);
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
    ]) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source, file).toContain('hasWebAppSessionTokenFromRequest');
    }
  });
});
