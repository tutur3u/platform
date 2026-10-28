import { expect, it, vi } from 'vitest';

const { session, permissions } = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: session,
  createAppSessionUser: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: permissions,
}));

import {
  authorizeDevboxRootAdmin,
  authorizeDevboxRootMember,
  authorizeDevboxRootViewer,
} from './authorization';

it.each([
  authorizeDevboxRootAdmin,
  authorizeDevboxRootMember,
  authorizeDevboxRootViewer,
])(
  'Infrastructure refuses agent credentials before session/root resolution',
  async (authorize) => {
    const result = await authorize(
      new Request('https://infra.example.test/api/v1/infrastructure/devboxes', {
        headers: { 'X-Devbox-Access-Token': `tdba_${'a'.repeat(64)}` },
      })
    );
    expect(result.ok || result.response.status).toBe(401);
    expect(session).not.toHaveBeenCalled();
    expect(permissions).not.toHaveBeenCalled();
  }
);

it('Infrastructure mutations enforce CSRF before resolving root membership', async () => {
  const result = await authorizeDevboxRootAdmin(
    new Request(
      'https://infra.example.test/api/v1/infrastructure/devboxes/runners/id/drain',
      {
        method: 'POST',
        headers: {
          cookie: 'sb-test-auth-token=present',
          origin: 'https://attacker.test',
          'sec-fetch-site': 'cross-site',
        },
      }
    )
  );
  expect(result.ok || result.response.status).toBe(403);
  expect(session).not.toHaveBeenCalled();
  expect(permissions).not.toHaveBeenCalled();
});
