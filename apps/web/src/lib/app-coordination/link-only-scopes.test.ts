// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { verifyAppSessionToken } from '@tuturuuu/auth/app-session';
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_USER_APP_SESSION_AUTH,
  CURRENT_USER_PROFILE_READ_APP_SESSION_AUTH,
  CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
} from '@/legacy-api-routes/v1/users/me/session-auth';
import { appTokenHasRequiredScope } from '@/lib/external-projects/access-mode';

const webSrc = join(__dirname, '../..');

// The only sources that may name the link-write scope: its definition, the
// exchange rule that shortens its bearers, and the one route that accepts it.
const ALLOWED_SOURCES = new Set([
  'app/api/v1/integrations/upskii/link/route.ts',
  'lib/app-coordination/link-only-scopes.ts',
  'lib/integrations/upskii/constants.ts',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name)
      ? [path]
      : [];
  });
}

describe('link-only bearers', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const bearer = () =>
    createAppCoordinationToken({
      expiresInSeconds: 120,
      scopes: ['upskii-link:write'],
      targetApp: 'upskii',
      userId: 'user-1',
    });

  it('is refused by every current-user app-session option', () => {
    const { token } = bearer();
    for (const options of [
      CURRENT_USER_APP_SESSION_AUTH,
      ...CURRENT_USER_PROFILE_READ_APP_SESSION_AUTH,
      ...CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    ]) {
      expect(verifyAppSessionToken(token, options).ok).toBe(false);
    }
  });

  it('is refused by every external-project scope mode', () => {
    const { claims } = bearer();
    for (const mode of ['read', 'edit', 'manage', 'publish'] as const) {
      expect(appTokenHasRequiredScope(claims, mode)).toBe(false);
    }
  });

  it('is named only by the link route and its definitions', () => {
    const offenders = sourceFiles(webSrc)
      .filter((file) =>
        /upskii-link:write|UPSKII_LINK_WRITE_SCOPE|LINK_ONLY_SCOPES/u.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(webSrc, file).split('\\').join('/'))
      .filter((file) => !ALLOWED_SOURCES.has(file));
    expect(offenders).toEqual([]);
  });
});
