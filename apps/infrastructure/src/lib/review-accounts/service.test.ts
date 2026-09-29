import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReviewAccount,
  isSafeReviewerEmail,
  listReviewAccounts,
  ReviewAccountError,
  updateReviewAccount,
} from './service';

const roleLookup = vi.fn().mockResolvedValue({ data: null, error: null });
const admin = {
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: roleLookup }),
    }),
  })),
  auth: {
    admin: {
      createUser: vi.fn(),
      getUserById: vi.fn(),
      inviteUserByEmail: vi.fn(),
      listUsers: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
};
const db = admin as never;
const actorUserId = 'admin-user';

describe('review account administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleLookup.mockResolvedValue({ data: null, error: null });
  });

  it('creates a confirmed, ordinary reviewer with an unrecoverable generated password', async () => {
    admin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'review-1' } },
      error: null,
    });
    const created = await createReviewAccount({
      actorUserId,
      displayName: 'App Reviewer',
      email: 'Review@tutur3u.com',
      kind: 'review',
      sbAdmin: db,
    });
    expect(created.email).toBe('review@tutur3u.com');
    expect(created.password).toMatch(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{24}$/
    );
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'review@tutur3u.com',
        email_confirm: true,
        password: created.password,
        app_metadata: {
          infrastructure_review_account: expect.objectContaining({
            kind: 'review',
            created_by: actorUserId,
          }),
        },
      })
    );
  });

  it('does not silently confirm an external person or reveal a password', async () => {
    admin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'external-1', app_metadata: { provider: 'email' } } },
      error: null,
    });
    admin.auth.admin.updateUserById.mockResolvedValue({
      data: { user: { id: 'external-1' } },
      error: null,
    });
    const created = await createReviewAccount({
      actorUserId,
      displayName: 'Beta Tester',
      email: 'tester@example.com',
      kind: 'external',
      sbAdmin: db,
    });
    expect(created.password).toBeNull();
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'tester@example.com',
      { data: { display_name: 'Beta Tester' } }
    );
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('external-1', {
      app_metadata: expect.objectContaining({
        provider: 'email',
        infrastructure_review_account: expect.objectContaining({
          kind: 'external',
        }),
      }),
    });
  });

  it('requires organization control for direct reviewer credentials', async () => {
    await expect(
      createReviewAccount({
        actorUserId,
        displayName: 'Reviewer',
        email: 'other@example.com',
        kind: 'review',
        sbAdmin: db,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it.each([
    'review@tuturuuu.com',
    'review@xwf.tuturuuu.com',
    'review@review.tuturuuu.com',
    'review@tutur3u.com.evil.example',
  ])('rejects privileged or unapproved reviewer domain %s', async (email) => {
    expect(isSafeReviewerEmail(email)).toBe(false);
    await expect(
      createReviewAccount({
        actorUserId,
        displayName: 'Reviewer',
        email,
        kind: 'review',
        sbAdmin: db,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('refuses a pre-provisioned platform role address', async () => {
    roleLookup.mockResolvedValueOnce({
      data: { email: 'review@tutur3u.com' },
      error: null,
    });
    await expect(
      createReviewAccount({
        actorUserId,
        displayName: 'Reviewer',
        email: 'review@tutur3u.com',
        kind: 'review',
        sbAdmin: db,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('refuses an external invite with a pre-provisioned platform role', async () => {
    roleLookup.mockResolvedValueOnce({
      data: { email: 'tester@example.com' },
      error: null,
    });
    await expect(
      createReviewAccount({
        actorUserId,
        displayName: 'Tester',
        email: 'tester@example.com',
        kind: 'external',
        sbAdmin: db,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it.each(['guest@tuturuuu.com', 'guest@xwf.tuturuuu.com'])(
    'refuses a staff-domain external invite %s',
    async (email) => {
      await expect(
        createReviewAccount({
          actorUserId,
          displayName: 'External tester',
          email,
          kind: 'external',
          sbAdmin: db,
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    }
  );

  it('lists only tagged accounts and omits credentials', async () => {
    admin.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: 'review-1',
            email: 'review@tuturuuu.com',
            created_at: '2026-01-01',
            last_sign_in_at: null,
            banned_until: null,
            email_confirmed_at: '2026-01-01',
            app_metadata: { infrastructure_review_account: { kind: 'review' } },
          },
          {
            id: 'other-1',
            email: 'customer@example.com',
            created_at: '2026-01-01',
            app_metadata: {},
          },
        ],
        nextPage: null,
      },
      error: null,
    });
    await expect(listReviewAccounts(db)).resolves.toEqual([
      expect.objectContaining({
        id: 'review-1',
        kind: 'review',
        emailConfirmed: true,
      }),
    ]);
  });

  it('will not rotate or disable an untagged account', async () => {
    admin.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: { id: 'other-1', email: 'other@example.com', app_metadata: {} },
      },
      error: null,
    });
    await expect(
      updateReviewAccount({
        actorUserId,
        action: 'disable',
        confirmationEmail: 'other@example.com',
        sbAdmin: db,
        userId: 'other-1',
      })
    ).rejects.toBeInstanceOf(ReviewAccountError);
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('requires exact email confirmation before rotating credentials', async () => {
    admin.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'review-1',
          email: 'review@tutur3u.com',
          app_metadata: { infrastructure_review_account: { kind: 'review' } },
        },
      },
      error: null,
    });
    await expect(
      updateReviewAccount({
        actorUserId,
        action: 'rotate_password',
        confirmationEmail: 'wrong@tuturuuu.com',
        sbAdmin: db,
        userId: 'review-1',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('keeps a legacy staff-domain reviewer disabled', async () => {
    admin.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'legacy-reviewer',
          email: 'review@tuturuuu.com',
          app_metadata: { infrastructure_review_account: { kind: 'review' } },
        },
      },
      error: null,
    });
    for (const action of ['enable', 'rotate_password'] as const) {
      await expect(
        updateReviewAccount({
          actorUserId,
          action,
          confirmationEmail: 'review@tuturuuu.com',
          sbAdmin: db,
          userId: 'legacy-reviewer',
        })
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
