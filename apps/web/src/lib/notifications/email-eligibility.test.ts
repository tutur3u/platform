import { describe, expect, it, vi } from 'vitest';
import { getNotificationSkipReason } from './cron-helpers';
import {
  getEmailPreferenceSkipReason,
  getEmailRecipientSkipDetail,
} from './email-eligibility';

const notification = {
  id: 'notification-1',
  user_id: 'user-1',
  ws_id: 'workspace-1',
  scope: 'workspace',
  type: 'task_mention',
  created_at: new Date().toISOString(),
};

function client({
  email = 'member@example.com',
  confirmed = true,
  blocked = false,
  disabled = '',
  verificationError = false,
  preferenceError = false,
}: {
  email?: string;
  confirmed?: boolean;
  blocked?: boolean;
  disabled?: string;
  verificationError?: boolean;
  preferenceError?: boolean;
} = {}) {
  return {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              email,
              email_confirmed_at: confirmed
                ? '2026-10-01T00:00:00Z'
                : undefined,
            },
          },
          error: verificationError ? new Error('auth unavailable') : null,
        })),
      },
    },
    rpc: vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === 'should_send_notification') {
        return {
          data: args.p_event_type !== disabled,
          error: preferenceError ? new Error('preferences unavailable') : null,
        };
      }
      if (name === 'get_email_block_statuses') {
        return {
          data: args.p_emails.map((email: string) => ({
            email,
            is_blocked: blocked,
          })),
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
  };
}

function options(email = 'member@example.com') {
  return {
    notification,
    channel: 'email',
    recipientEmail: email,
    membershipCache: new Map([['workspace-1:user-1', true]]),
  };
}

describe('notification email eligibility matrix', () => {
  it.each(['member@example.com', 'member@gmail.com', 'member@tuturuuu.com'])(
    'admits eligible destination %s',
    async (email) => {
      const admin = client({ email });
      expect(await getNotificationSkipReason(admin, options(email))).toBeNull();
      expect(admin.rpc).toHaveBeenCalledWith('get_email_block_statuses', {
        p_emails: [email],
      });
    }
  );

  it.each(['email_notifications', 'workspace_activity', 'task_mention'])(
    'honors current %s opt-out after queueing',
    async (disabled) => {
      const admin = client({ disabled });
      expect(await getNotificationSkipReason(admin, options())).toBe(
        'skipped: email_preferences_disabled'
      );
      expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
    }
  );

  it('passes workspace, event, account and email channel scopes to the preference resolver', async () => {
    const admin = client();
    await getNotificationSkipReason(admin, options());
    expect(
      admin.rpc.mock.calls.filter(
        ([name]) => name === 'should_send_notification'
      )
    ).toEqual([
      [
        'should_send_notification',
        {
          p_user_id: 'user-1',
          p_event_type: 'email_notifications',
          p_channel: 'email',
          p_scope: 'user',
          p_ws_id: null,
        },
      ],
      [
        'should_send_notification',
        {
          p_user_id: 'user-1',
          p_event_type: 'workspace_activity',
          p_channel: 'email',
          p_scope: 'user',
          p_ws_id: null,
        },
      ],
      [
        'should_send_notification',
        {
          p_user_id: 'user-1',
          p_event_type: 'task_mention',
          p_channel: 'email',
          p_scope: 'workspace',
          p_ws_id: 'workspace-1',
        },
      ],
    ]);
  });

  it('rejects an unconfirmed external account', async () => {
    expect(
      await getNotificationSkipReason(client({ confirmed: false }), options())
    ).toBe('skipped: undeliverable_email:unverified_recipient_email');
  });

  it('rejects a stale profile or batch address that differs from the confirmed account', async () => {
    expect(
      await getNotificationSkipReason(
        client({ email: 'new@example.com' }),
        options()
      )
    ).toBe('skipped: undeliverable_email:unverified_recipient_email');
  });

  it('matches confirmed destinations case-insensitively', async () => {
    expect(
      await getNotificationSkipReason(
        client({ email: 'MEMBER@example.com' }),
        options()
      )
    ).toBeNull();
  });

  it('does not infer external verification from an email-only invitation', async () => {
    const admin = client();
    expect(
      await getNotificationSkipReason(admin, {
        ...options(),
        notification: {
          ...notification,
          user_id: null,
          type: 'workspace_invite',
        },
      })
    ).toBe('skipped: undeliverable_email:unverified_recipient_email');
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('preserves existing internal email-only invitation admission', async () => {
    const admin = client();
    expect(
      await getNotificationSkipReason(admin, {
        ...options('member@tuturuuu.com'),
        notification: {
          ...notification,
          user_id: null,
          type: 'workspace_invite',
        },
      })
    ).toBeNull();
  });

  it.each(['member@example.com', 'member@tuturuuu.com'])(
    'retains pre-send suppression for %s',
    async (email) => {
      expect(
        await getNotificationSkipReason(
          client({ email, blocked: true }),
          options(email)
        )
      ).toBe('skipped: undeliverable_email:blocked_recipient_blacklist');
    }
  );

  it.each(['unsubscribe', 'complaint', 'hard_bounce'])(
    'retains EmailService rejection %s',
    async (reason) => {
      expect(
        await getNotificationSkipReason(client(), {
          ...options(),
          sendResult: {
            blockedRecipients: [
              {
                email: 'member@example.com',
                reason: 'blacklist',
                details: reason,
              },
            ],
          },
        })
      ).toBe('skipped: undeliverable_email:blocked_recipient_blacklist');
    }
  );

  it('fails closed on verification lookup failure', async () => {
    await expect(
      getNotificationSkipReason(client({ verificationError: true }), options())
    ).rejects.toThrow('Failed to verify notification email recipient');
  });

  it('fails closed on preference lookup failure', async () => {
    await expect(
      getNotificationSkipReason(client({ preferenceError: true }), options())
    ).rejects.toThrow('Failed to verify notification email preferences');
  });

  it('fails closed on a missing preference result', async () => {
    const admin = client();
    admin.rpc.mockResolvedValue({ data: null, error: null } as any);
    await expect(
      getEmailPreferenceSkipReason(admin, notification)
    ).rejects.toThrow('Failed to verify');
  });

  it.each([undefined, {}])(
    'fails closed when the preference RPC is unavailable: %s',
    async (rpc) => {
      const admin = { ...client(), rpc };
      await expect(getNotificationSkipReason(admin, options())).rejects.toThrow(
        'Notification email preference lookup unavailable'
      );
      expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
    }
  );

  it('fails closed when the queued event has no preference key', async () => {
    const admin = client();
    await expect(
      getNotificationSkipReason(admin, {
        ...options(),
        notification: { ...notification, type: undefined },
      })
    ).rejects.toThrow('Notification email preference lookup unavailable');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('fails closed when the Auth verification client is unavailable', async () => {
    const configured = client();
    const admin = { from: configured.from, rpc: configured.rpc };
    await expect(getNotificationSkipReason(admin, options())).rejects.toThrow(
      'Notification email verification unavailable'
    );
    expect(configured.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('rejects malformed destinations before an Auth lookup', async () => {
    const admin = client();
    expect(
      await getEmailRecipientSkipDetail(admin, notification, 'invalid-email')
    ).toBe('invalid_recipient_email');
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('retains stale membership denial before verification', async () => {
    const admin = client();
    expect(
      await getNotificationSkipReason(admin, {
        ...options(),
        membershipCache: new Map([['workspace-1:user-1', false]]),
      })
    ).toBe('skipped: stale_workspace_membership');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('does not apply email admission or preferences to push', async () => {
    const admin = client({ disabled: 'email_notifications', confirmed: false });
    expect(
      await getNotificationSkipReason(admin, {
        ...options(),
        channel: 'push',
        recipientEmail: undefined,
      })
    ).toBeNull();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('keeps transactional account updates independent of marketing opt-out', async () => {
    const admin = client({ disabled: 'marketing_communications' });
    expect(
      await getNotificationSkipReason(admin, {
        ...options(),
        notification: {
          ...notification,
          type: 'account_update',
          scope: 'user',
          ws_id: null,
        },
      })
    ).toBeNull();
    expect(
      admin.rpc.mock.calls.some(
        ([, args]) => args.p_event_type === 'marketing_communications'
      )
    ).toBe(false);
  });

  it.each(['security_alerts', 'security_alert', 'email_notifications'])(
    'honors %s for queued security notifications',
    async (disabled) => {
      expect(
        await getNotificationSkipReason(client({ disabled }), {
          ...options(),
          notification: {
            ...notification,
            type: 'security_alert',
            scope: 'system',
            ws_id: null,
          },
        })
      ).toBe('skipped: email_preferences_disabled');
    }
  );
});
