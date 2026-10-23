import { describe, expect, it } from 'vitest';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
  type NotificationAccessContext,
} from './access';

describe('buildNotificationAccessFilter', () => {
  it('includes user ownership and confirmed email-invite branches', () => {
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
        'and(user_id.is.null,type.eq.workspace_invite,email.ilike."local@tuturuuu.com"),' +
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
      'user_id.is.null,type.eq.workspace_invite,email.ilike."local@tuturuuu.com"'
    );
    expect(filter).not.toContain(
      'scope.in.(user,system),user_id.is.null,email.eq.'
    );
    expect(filter).not.toContain('user_id.is.null,email.ilike.');
  });

  it('matches an unclaimed user-scope invite for a non-member without ws_id', () => {
    const inviteRow = {
      email: 'invitee@tuturuuu.com',
      scope: 'user',
      type: 'workspace_invite',
      user_id: null,
      ws_id: null,
    };
    const filter = buildNotificationAccessFilter({
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: inviteRow.email,
      workspaceIds: [],
    });
    const inviteBranch = filter.match(/and\(user_id\.is\.null,[^)]*\)/)?.[0];

    expect(inviteBranch).toBeDefined();
    expect(inviteRow.scope).toBe('user');
    expect(inviteRow.ws_id).toBeNull();
    expect(inviteRow.user_id).toBeNull();
    expect(inviteBranch).toContain('user_id.is.null');
    expect(inviteBranch).toContain('type.eq.workspace_invite');
    expect(inviteBranch).toContain(`email.ilike."${inviteRow.email}"`);
    expect(inviteBranch).not.toContain('scope.');
    expect(inviteBranch).not.toContain('ws_id');
  });

  it('does not match claimed invites by email or invites addressed to another email', () => {
    const context: NotificationAccessContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: 'current@tuturuuu.com',
      workspaceIds: [],
    };
    const filter = buildNotificationAccessFilter(context);
    const claimedByAnotherUser = {
      email: 'current@tuturuuu.com',
      type: 'workspace_invite',
      user_id: '00000000-0000-0000-0000-000000000002',
    };
    const addressedToAnotherEmail = buildNotificationAccessFilter({
      ...context,
      userEmail: 'another@tuturuuu.com',
    });

    expect(filter).toContain('user_id.is.null,type.eq.workspace_invite');
    expect(filter).not.toContain(claimedByAnotherUser.user_id);
    expect(addressedToAnotherEmail).toContain(
      'email.ilike."another@tuturuuu.com"'
    );
    expect(addressedToAnotherEmail).not.toContain(
      'email.ilike."current@tuturuuu.com"'
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
    expect(buildNotificationAccessFilter(unconfirmed)).not.toContain(
      'type.eq.workspace_invite'
    );
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
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    };

    const context = await getNotificationAccessContext(
      supabase as never,
      {
        email: 'stale@tuturuuu.com',
        id: '00000000-0000-0000-0000-000000000001',
      },
      { auth: { admin: { getUserById } } } as never
    );

    expect(context.userEmail).toBe('current@tuturuuu.com');
    const filter = buildNotificationAccessFilter({
      ...context,
      workspaceIds: ['00000000-0000-0000-0000-000000000004'],
    });
    expect(filter).toContain('email.ilike."current@tuturuuu.com"');
    expect(filter).not.toContain('stale@tuturuuu.com');
  });

  it('omits email access when the auth lookup cannot confirm the identity', async () => {
    const requestSupabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    };
    const identitySupabase = {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: null },
            error: { message: 'lookup unavailable' },
          }),
        },
      },
    };

    const context = await getNotificationAccessContext(
      requestSupabase as never,
      {
        email: 'unconfirmed@tuturuuu.com',
        id: '00000000-0000-0000-0000-000000000001',
      },
      identitySupabase as never
    );

    expect(context.userEmail).toBeNull();
    expect(buildNotificationAccessFilter(context)).not.toContain(
      'type.eq.workspace_invite'
    );
  });
});
