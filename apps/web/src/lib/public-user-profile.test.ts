import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  publicProfileImage,
  readPublicUserProfile,
} from './public-user-profile';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  read: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async (options: unknown) => {
    mocks.admin(options);
    return {
      from: () => ({
        select: (columns: string) => {
          mocks.select(columns);
          return {
            eq: (key: string, value: string) => {
              mocks.eq(key, value);
              return { maybeSingle: mocks.read };
            },
          };
        },
      }),
    };
  },
}));
beforeEach(() => vi.clearAllMocks());
describe('public profile privacy', () => {
  it('selects and returns only the four public fields even if storage returns extra data', async () => {
    mocks.read.mockResolvedValue({
      data: {
        display_name: 'Creator',
        avatar_url: null,
        banner_url: null,
        bio: 'Public biography',
        email: 'private@example.com',
        id: 'private-id',
        handle: 'creator',
        created_at: 'private-date',
      },
      error: null,
    });
    expect(await readPublicUserProfile('Creator')).toEqual({
      display_name: 'Creator',
      avatar_url: null,
      banner_url: null,
      bio: 'Public biography',
    });
    expect(mocks.admin).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.select).toHaveBeenCalledWith(
      'display_name,avatar_url,banner_url,bio'
    );
    expect(mocks.eq).toHaveBeenCalledWith('handle', 'creator');
  });
  it.each(['../users', 'someone@example.com', '', 'a'.repeat(101)])(
    'rejects invalid username %s before database access',
    async (username) => {
      expect(await readPublicUserProfile(username)).toBeNull();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it('returns no profile for an unknown username', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    expect(await readPublicUserProfile('missing')).toBeNull();
  });
  it('fails closed on database errors', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(readPublicUserProfile('creator')).rejects.toThrow(
      'Unable to read public profile'
    );
  });
  it.each([
    'javascript:alert(1)',
    'http://example.com/image',
    'https://user:pass@example.com/image',
    'broken',
    null,
  ])('rejects unsafe artwork %s', (value) => {
    expect(publicProfileImage(value)).toBeUndefined();
  });
  it('permits HTTPS artwork', () =>
    expect(publicProfileImage('https://example.com/image')).toBe(
      'https://example.com/image'
    ));
});
