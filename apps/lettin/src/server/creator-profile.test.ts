import { beforeEach, expect, it, vi } from 'vitest';
import { readCreatorIdentity } from './creator-profile';

const mocks = vi.hoisted(() => ({ read: vi.fn(), select: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: (columns: string) => {
        mocks.select(columns);
        return { eq: () => ({ maybeSingle: mocks.read }) };
      },
    }),
  }),
}));
const identity = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Creator',
  handle: 'creator',
  bio: null,
  avatar_url: null,
};
beforeEach(() => {
  mocks.read.mockReset();
  mocks.select.mockClear();
  mocks.read.mockResolvedValueOnce({ data: identity, error: null });
});
it('reads only public fields and validates the additive banner projection', async () => {
  mocks.read.mockResolvedValueOnce({
    data: { banner_url: 'https://example.com/banner' },
    error: null,
  });
  expect(await readCreatorIdentity('creator')).toEqual({
    ...identity,
    banner_url: 'https://example.com/banner',
  });
  expect(mocks.select.mock.calls).toEqual([
    ['id,display_name,handle,bio,avatar_url'],
    ['banner_url'],
  ]);
});
it.each(['42703', 'PGRST204'])(
  'permits only a missing banner schema (%s)',
  async (code) => {
    mocks.read.mockResolvedValueOnce({ data: null, error: { code } });
    expect(await readCreatorIdentity('creator')).toEqual({
      ...identity,
      banner_url: null,
    });
  }
);
it('fails closed on other errors or malformed banner responses', async () => {
  mocks.read.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  await expect(readCreatorIdentity('creator')).rejects.toThrow(
    'Unable to read creator banner'
  );
  mocks.read.mockResolvedValueOnce({ data: identity, error: null });
  mocks.read.mockResolvedValueOnce({ data: { banner_url: 42 }, error: null });
  await expect(readCreatorIdentity('creator')).rejects.toThrow(
    'Unable to read creator banner'
  );
});
