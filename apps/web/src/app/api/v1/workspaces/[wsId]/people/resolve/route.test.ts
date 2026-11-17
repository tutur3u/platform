import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authenticated: true,
  member: true,
  publicContacts: true,
  privateContacts: true,
  policyError: false,
  hidden: [] as string[],
  filters: [] as string[],
  conditions: [] as [string, unknown][],
  tables: [] as string[],
  missingMailBlocked: false,
  contactSelects: [] as string[],
}));

class Query {
  private columns = '';
  constructor(private table: string) {}
  select(columns = '') {
    this.columns = columns;
    if (this.table === 'workspace_users') state.contactSelects.push(columns);
    return this;
  }
  eq(field: string, value: unknown) {
    state.conditions.push([field, value]);
    return this;
  }
  in() {
    return this;
  }
  or(filter: string) {
    state.filters.push(filter);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then(
    resolve: (value: {
      data: unknown[] | null;
      error: Error | { code: string } | null;
    }) => unknown
  ) {
    if (
      state.missingMailBlocked &&
      this.table === 'workspace_users' &&
      this.columns.includes('mail_blocked')
    )
      return Promise.resolve({ data: null, error: { code: '42703' } }).then(
        resolve
      );
    const data =
      this.table === 'workspace_secrets'
        ? state.hidden.map((name) => ({ name }))
        : [
            {
              id: this.table,
              display_name: 'Test name',
              full_name: 'Test Full',
              email: 'test@example.com',
              mail_blocked: false,
              avatar_url: null,
            },
          ];
    return Promise.resolve({
      data,
      error: state.policyError ? new Error('policy read failed') : null,
    }).then(resolve);
  }
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      state.tables.push(table);
      return new Query(table);
    },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: state.member }),
  getPermissions: async () => ({
    containsPermission: (permission: string) =>
      permission === 'view_users_public_info'
        ? state.publicContacts
        : state.privateContacts,
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-1',
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (...args: unknown[]) => Promise<Response>) =>
    async (request: Request) => {
      if (!state.authenticated)
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      return handler(
        request,
        {
          user: { id: 'actor-1' },
          supabase: {
            from: (table: string) => {
              state.tables.push(table);
              return new Query(table);
            },
          },
        },
        { wsId: 'workspace-1' }
      );
    },
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { POST } from './route';

const resolve = (body: unknown) =>
  POST(
    new NextRequest(
      'https://example.com/api/v1/workspaces/workspace-1/people/resolve',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    )
  );

describe('workspace people resolve route', () => {
  beforeEach(() => {
    state.authenticated = true;
    state.member = true;
    state.publicContacts = true;
    state.privateContacts = true;
    state.policyError = false;
    state.hidden = [];
    state.filters = [];
    state.conditions = [];
    state.tables = [];
    state.missingMailBlocked = false;
    state.contactSelects = [];
  });

  it('leaves unauthenticated requests to the session boundary', async () => {
    state.authenticated = false;
    expect((await resolve({ emails: ['test@example.com'] })).status).toBe(401);
    expect(state.tables).toEqual([]);
  });

  it('rejects invalid bodies before any read', async () => {
    for (const body of [
      {},
      { emails: [] },
      { emails: ['nope'] },
      { emails: ['a@b.co'], extra: 1 },
    ]) {
      expect((await resolve(body)).status).toBe(400);
    }
    expect(state.tables).toEqual([]);
  });

  it('denies foreign workspaces before data reads', async () => {
    state.member = false;
    expect((await resolve({ emails: ['test@example.com'] })).status).toBe(404);
    expect(state.tables).toEqual([]);
  });

  it('requires people read permissions', async () => {
    state.publicContacts = false;
    state.privateContacts = false;
    expect((await resolve({ emails: ['test@example.com'] })).status).toBe(403);
    expect(state.tables).toEqual([]);
  });

  it('matches exact addresses only and scopes reads to the workspace', async () => {
    const response = await resolve({
      emails: ['Test@Example.com', 'a_b@x.vn'],
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(state.filters).toContain(
      'email.ilike."test@example.com",email.ilike."a\\_b@x.vn"'
    );
    expect(state.filters.every((filter) => !filter.includes('%'))).toBe(true);
    expect(state.conditions).toContainEqual(['ws_id', 'workspace-1']);
    expect(state.conditions).toContainEqual(['pending', false]);
    const { data } = await response.json();
    expect(data.map((row: { kind: string }) => row.kind)).toEqual([
      'member',
      'unknown',
    ]);
  });

  it('confirms no address when the workspace hides member emails', async () => {
    state.hidden = ['HIDE_MEMBER_EMAIL'];
    const { data } = await (
      await resolve({ emails: ['test@example.com'] })
    ).json();
    expect(state.tables).not.toContain('workspace_members_and_invites');
    expect(state.tables).not.toContain('workspace_users');
    expect(data[0].kind).toBe('unknown');
  });

  it('skips contact matching without private-info access', async () => {
    state.privateContacts = false;
    await resolve({ emails: ['test@example.com'] });
    expect(state.tables).not.toContain('workspace_users');
  });

  it('fails closed when the privacy policy cannot be read', async () => {
    state.policyError = true;
    const response = await resolve({ emails: ['test@example.com'] });
    expect(response.status).toBe(500);
    expect(state.tables).toEqual(['workspace_secrets']);
  });

  it('resolves contacts without the blocked flag before its migration applies', async () => {
    state.missingMailBlocked = true;
    const response = await resolve({ emails: ['test@example.com'] });
    expect(response.status).toBe(200);
    expect(state.contactSelects).toEqual([
      'id, display_name, full_name, email, avatar_url, mail_blocked',
      'id, display_name, full_name, email, avatar_url',
    ]);
    const { data } = await response.json();
    expect(data[0].kind).toBe('member');
  });
});
