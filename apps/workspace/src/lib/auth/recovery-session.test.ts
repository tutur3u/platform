import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createDetachedClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
  createDetachedClient: mocks.createDetachedClient,
}));
vi.mock('@tuturuuu/utils/email/server', () => ({
  checkIfUserExists: vi.fn().mockResolvedValue('user-1'),
}));
vi.mock('./recovery-store', () => ({
  getActiveAuthRecoveryOverride: vi.fn(),
  logAuthRecoveryEvent: vi.fn().mockResolvedValue(undefined),
}));

import { issueAuthRecoverySession } from './recovery-session';

describe('issueAuthRecoverySession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue({
            data: {
              properties: {
                action_link: 'https://example.supabase.co/verify?token=hash',
              },
            },
            error: null,
          }),
          updateUserById: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          expires_at: 123,
          expires_in: 3600,
          refresh_token: 'refresh',
          token_type: 'bearer',
        },
      },
      error: null,
    });
    mocks.createDetachedClient.mockReturnValue({
      auth: { verifyOtp: mocks.verifyOtp },
    });
  });

  it("creates the session with the recovering browser's user agent", async () => {
    await issueAuthRecoverySession('person@example.com', 'override-1', {
      userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15',
    });

    expect(mocks.createDetachedClient).toHaveBeenCalledWith({
      userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash',
      type: 'magiclink',
    });
  });

  it.each([
    ['no options', undefined],
    ['a null user agent', { userAgent: null }],
    ['an empty user agent', { userAgent: '' }],
  ])('uses the default detached client with %s', async (_label, options) => {
    const session = await issueAuthRecoverySession(
      'person@example.com',
      'override-1',
      options
    );

    expect(mocks.createDetachedClient).toHaveBeenCalledWith();
    expect(session).toEqual({
      access_token: 'access',
      expires_at: 123,
      expires_in: 3600,
      refresh_token: 'refresh',
      token_type: 'bearer',
    });
  });
});
