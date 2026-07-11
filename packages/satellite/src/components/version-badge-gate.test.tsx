import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getSatelliteCurrentUser: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: mocks.connection,
}));

vi.mock('../auth', () => ({
  getSatelliteCurrentUser: mocks.getSatelliteCurrentUser,
}));

vi.mock('@tuturuuu/utils/email/client', () => ({
  isExactTuturuuuDotComEmail: vi.fn(() => true),
}));

vi.mock('@tuturuuu/utils/platform-release', () => ({
  getPlatformReleaseInfo: vi.fn(() => ({ version: 'test' })),
}));

vi.mock('@tuturuuu/ui/custom/version-badge', () => ({
  VersionBadge: vi.fn(() => null),
}));

import { SatelliteVersionBadge } from './version-badge-gate';

describe('SatelliteVersionBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getSatelliteCurrentUser.mockResolvedValue({
      email: 'member@tuturuuu.com',
      id: 'user-1',
    });
  });

  it('waits for a request before resolving the satellite user', async () => {
    await SatelliteVersionBadge({ appName: 'Contacts' });

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSatelliteCurrentUser.mock.invocationCallOrder[0] ?? 0
    );
  });
});
