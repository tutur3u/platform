import { describe, expect, it } from 'vitest';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
  type NotificationAccessContext,
} from './access';

describe('buildNotificationAccessFilter', () => {
  it('includes user ownership and confirmed workspace-invite email branches', () => {
    const context: NotificationAccessContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: 'local@tuturuuu.com',
      workspaceIds: [
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000004',
      ],
    };

    expect(buildNotificationAccessFilter(context)).toBe(
      'and(scope.in.(user,system),user_id.eq.00000000-0000-0000-0000-000000000001),' +
        'and(scope.eq.workspace,user_id.is.null,type.eq.workspace_invite,email.eq."local@tuturuuu.com",ws_id.in.(00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000004)),' +
        'and(scope.eq.workspace,user_id.eq.00000000-0000-0000-0000-000000000001,or(ws_id.is.null,ws_id.in.(00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000004)))'
    );
  });

  it('keeps workspace-scoped access narrow when the user has no memberships', () => {
    const context: NotificationAccessContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: null,
      workspaceIds: [],
    };

    expect(buildNotificationAccessFilter(context)).toBe(
      'and(scope.in.(user,system),user_id.eq.00000000-0000-0000-0000-000000000001),' +
        'and(scope.eq.workspace,user_id.eq.00000000-0000-0000-0000-000000000001,ws_id.is.null)'
    );
  });

  it('does not admit non-invite email-addressed rows to list or mark-as-read access', () => {
    const filter = buildNotificationAccessFilter({
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: 'local@tuturuuu.com',
      workspaceIds: ['00000000-0000-0000-0000-000000000004'],
    });

    expect(filter).toContain(
      'scope.eq.workspace,user_id.is.null,type.eq.workspace_invite,email.eq."local@tuturuuu.com"'
    );
    expect(filter).not.toContain(
      'scope.in.(user,system),user_id.is.null,email.eq.'
    );
    expect(filter).not.toContain(
      'scope.eq.workspace,user_id.is.null,email.eq.'
    );
  });

  it('uses only a confirmed email and normalizes it before matching', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [{ ws_id: '00000000-0000-0000-0000-000000000004' }],
            error: null,
          }),
        }),
      }),
    };

    const unconfirmed = await getNotificationAccessContext(supabase as never, {
      email: ' Local@Tuturuuu.com ',
      email_confirmed_at: null,
      id: '00000000-0000-0000-0000-000000000001',
    });
    const confirmed = await getNotificationAccessContext(supabase as never, {
      email: ' Local@Tuturuuu.com ',
      email_confirmed_at: '2026-10-24T00:00:00.000Z',
      id: '00000000-0000-0000-0000-000000000001',
    });

    expect(unconfirmed.userEmail).toBeNull();
    expect(confirmed.userEmail).toBe('local@tuturuuu.com');
  });

  it('re-reads app-session email confirmation from the auth user record', async () => {
    const getUserById = async () => ({
      data: {
        user: {
          email: 'Current@Tuturuuu.com',
          email_confirmed_at: '2026-10-24T00:00:00.000Z',
        },
      },
      error: null,
    });
    const supabase = {
      auth: { admin: { getUserById } },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    };

    const context = await getNotificationAccessContext(supabase as never, {
      email: 'stale@tuturuuu.com',
      id: '00000000-0000-0000-0000-000000000001',
    });

    expect(context.userEmail).toBe('current@tuturuuu.com');
    const filter = buildNotificationAccessFilter({
      ...context,
      workspaceIds: ['00000000-0000-0000-0000-000000000004'],
    });
    expect(filter).toContain('email.eq."current@tuturuuu.com"');
    expect(filter).not.toContain('stale@tuturuuu.com');
  });
});
