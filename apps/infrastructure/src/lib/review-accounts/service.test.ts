import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReviewAccount,
  listReviewAccounts,
  ReviewAccountError,
  updateReviewAccount,
} from './service';

const admin = {
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
  beforeEach(() => vi.clearAllMocks());

  it('creates a confirmed, ordinary reviewer with an unrecoverable generated password', async () => {
    admin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'review-1' } },
      error: null,
    });
    const created = await createReviewAccount({
      actorUserId,
      displayName: 'App Reviewer',
      email: 'Review@tuturuuu.com',
      kind: 'review',
      sbAdmin: db,
    });
    expect(created.email).toBe('review@tuturuuu.com');
    expect(created.password).toMatch(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{24}$/
    );
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'review@tuturuuu.com',
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
          email: 'review@tuturuuu.com',
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
});
