// @vitest-environment node
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { afterEach, describe, expect, it, vi } from 'vitest';

const suppliers = vi.hoisted(() => ({
  actor: vi.fn(),
  profile: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: suppliers.actor,
  getSatelliteCurrentUser: suppliers.profile,
}));

import { loadGatewayData } from './page-data.server';
import { withRequestContext } from './request-context';

afterEach(() => vi.resetAllMocks());
describe('native loader public transport', () => {
  it('verifies the Apps target and transports only actor id for an ordinary account', async () => {
    suppliers.actor.mockResolvedValue({
      id: 'actor',
      access_token: 'secret-token',
      user_metadata: { private: 'private' },
    });
    suppliers.profile.mockResolvedValue({
      email: 'fixture@example.test',
      private: 'private-profile',
    });
    const data = await withRequestContext(
      new Request('https://apps.tuturuuu.com', {
        headers: { cookie: 'NEXT_LOCALE=vi' },
      }),
      loadGatewayData
    );
    expect(suppliers.actor).toHaveBeenCalledWith('apps');
    expect(suppliers.profile).toHaveBeenCalledWith('apps');
    expect(data).toEqual({ actorId: 'actor', locale: 'vi', release: null });
    expect(JSON.stringify(data)).not.toMatch(
      /secret-token|private-profile|user_metadata/
    );
  });
  it.each(['member@tuturuuu.com', 'MEMBER@TUTURUUU.COM'])(
    'transports actual Apps release metadata only for exact internal email %s',
    async (email) => {
      suppliers.actor.mockResolvedValue({
        id: 'internal-actor',
        access_token: 'private-token',
      });
      suppliers.profile.mockResolvedValue({
        email,
        id: 'private-profile-id',
        full_name: 'Private Name',
        private: 'private-profile',
        user_metadata: { private: true },
      });
      const data = await withRequestContext(
        new Request('https://apps.tuturuuu.com', {
          headers: { cookie: 'NEXT_LOCALE=vi' },
        }),
        loadGatewayData
      );
      expect(data).toEqual({
        actorId: 'internal-actor',
        locale: 'vi',
        release: getPlatformReleaseInfo('Tuturuuu Apps'),
      });
      expect(data.release?.appName).toBe('Tuturuuu Apps');
      expect(Object.keys(data).sort()).toEqual([
        'actorId',
        'locale',
        'release',
      ]);
      expect(JSON.stringify(data)).not.toMatch(
        /private-token|private-profile|Private Name|user_metadata|full_name/
      );
      expect(suppliers.actor).toHaveBeenCalledExactlyOnceWith('apps');
      expect(suppliers.profile).toHaveBeenCalledExactlyOnceWith('apps');
    }
  );
  it.each([
    'member@tuturuuu.com.evil.test',
    'member@sub.tuturuuu.com',
    'member@xwf.tuturuuu.com',
    'member@tuturuuu-com.test',
  ])('withholds release metadata from lookalike email %s', async (email) => {
    suppliers.actor.mockResolvedValue({ id: 'ordinary-actor' });
    suppliers.profile.mockResolvedValue({ email, private: 'private-profile' });
    const data = await withRequestContext(
      new Request('https://apps.tuturuuu.com'),
      loadGatewayData
    );
    expect(data).toEqual({
      actorId: 'ordinary-actor',
      locale: 'en',
      release: null,
    });
    expect(JSON.stringify(data)).not.toContain('private-profile');
  });
  it('allows an anonymous public catalogue without granting workspace visibility', async () => {
    suppliers.actor.mockResolvedValue(null);
    suppliers.profile.mockResolvedValue(null);
    const data = await withRequestContext(
      new Request('https://apps.tuturuuu.com'),
      loadGatewayData
    );
    expect(data).toEqual({ actorId: null, locale: 'en', release: null });
  });
  it('does not turn a profile-read failure into a fabricated actor', async () => {
    suppliers.actor.mockRejectedValue(
      new Error('session provider unavailable')
    );
    await expect(
      withRequestContext(
        new Request('https://apps.tuturuuu.com'),
        loadGatewayData
      )
    ).rejects.toThrow('session provider unavailable');
    expect(suppliers.profile).not.toHaveBeenCalled();
  });
});
