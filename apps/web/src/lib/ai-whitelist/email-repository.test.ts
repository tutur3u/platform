import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('server-only', () => ({}));

import { isAIWhitelistEmailEnabled } from './email-repository';

function mockWhitelistLookup(result: {
  data: { enabled: boolean } | null;
  error: Error | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const schema = vi.fn().mockReturnValue({ from });

  mocks.createAdminClient.mockResolvedValue({ schema });

  return { eq, from, maybeSingle, schema, select };
}

describe('isAIWhitelistEmailEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { enabled: true, expected: true },
    { enabled: false, expected: false },
  ])(
    'returns $expected when enabled is $enabled',
    async ({ enabled, expected }) => {
      const query = mockWhitelistLookup({ data: { enabled }, error: null });

      await expect(
        isAIWhitelistEmailEnabled('learner@example.com')
      ).resolves.toBe(expected);

      expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
      expect(query.schema).toHaveBeenCalledWith('private');
      expect(query.from).toHaveBeenCalledWith('ai_whitelisted_emails');
      expect(query.select).toHaveBeenCalledWith('enabled');
      expect(query.eq).toHaveBeenCalledWith('email', 'learner@example.com');
      expect(query.maybeSingle).toHaveBeenCalledOnce();
    }
  );

  it('fails closed when no whitelist row exists', async () => {
    mockWhitelistLookup({ data: null, error: null });

    await expect(
      isAIWhitelistEmailEnabled('missing@example.com')
    ).resolves.toBe(false);
  });

  it('surfaces database errors instead of granting access', async () => {
    const error = new Error('private schema unavailable');
    mockWhitelistLookup({ data: null, error });

    await expect(isAIWhitelistEmailEnabled('learner@example.com')).rejects.toBe(
      error
    );
  });
});
