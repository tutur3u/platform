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
  'apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar-settings',
  'apps/web/src/app/api/v1/workspaces/[wsId]/calendar-hours',
  'apps/web/src/app/api/v1/workspaces/[wsId]/encryption',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/modules',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-order',
  'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups',
  'apps/web/src/app/api/v1/users/me/profile',
  'apps/web/src/app/api/v1/users/me/avatar',
  'apps/web/src/app/api/v1/users/me/email',
];

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

        const optInCount = (source.match(/allowAppSessionAuth:\s*true/g) ?? [])
          .length;

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
});
