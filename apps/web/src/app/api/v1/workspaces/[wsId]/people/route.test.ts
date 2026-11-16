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
}));

class Query {
  constructor(private table: string) {}
  select() { return this; }
  eq(field: string, value: unknown) { state.conditions.push([field, value]); return this; }
  in() { return this; }
  or(filter: string) { state.filters.push(filter); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve: (value: { data: unknown[]; error: Error | null }) => unknown) {
    const data = this.table === 'workspace_secrets'
      ? state.hidden.map((name) => ({ name }))
      : [{ id: this.table, display_name: 'Test name', full_name: 'Test Full', email: 'test@example.com', avatar_url: null }];
    return Promise.resolve({ data, error: state.policyError ? new Error('policy read failed') : null }).then(resolve);
  }
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: (table: string) => { state.tables.push(table); return new Query(table); } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: state.member }),
  getPermissions: async () => ({ containsPermission: (permission: string) => permission === 'view_users_public_info' ? state.publicContacts : state.privateContacts }),
}));
vi.mock('@/lib/workspace-helper', () => ({ normalizeWorkspaceId: async () => 'workspace-1' }));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: (...args: unknown[]) => Promise<Response>) => async (request: Request) => {
    if (!state.authenticated) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return handler(request, {
      user: { id: 'actor-1' },
      supabase: { from: (table: string) => { state.tables.push(table); return new Query(table); } },
    }, { wsId: 'workspace-1' });
  },
}));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), connection: async () => {} }));

import { GET } from './route';

const search = (query = 'test', limit = '10') => GET(new NextRequest(`https://example.com/api/v1/workspaces/workspace-1/people?${new URLSearchParams({ q: query, limit })}`));

describe('workspace people route', () => {
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
  });

  it('leaves unauthenticated requests to the session boundary without data reads', async () => {
    state.authenticated = false;
    expect((await search()).status).toBe(401);
    expect(state.tables).toEqual([]);
  });

  it('denies foreign workspaces before data or policy reads', async () => {
    state.member = false;
    const response = await search();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(state.tables).toEqual([]);
  });

  it('requires contact read permissions before querying', async () => {
    state.publicContacts = false;
    state.privateContacts = false;
    expect((await search()).status).toBe(403);
    expect(state.tables).toEqual([]);
  });

  it.each([['x', '10'], ['x'.repeat(101), '10'], ['test', '21'], ['test', '0'], ['test', '1.5'], ['test*', '10']])('rejects invalid search %s / %s before reads', async (query, limit) => {
    expect((await search(query, limit)).status).toBe(400);
    expect(state.tables).toEqual([]);
  });

  it('omits hidden fields from database matching and output', async () => {
    state.hidden = ['HIDE_MEMBER_EMAIL'];
    const response = await search();
    expect(state.filters.every((filter) => !filter.includes('email.ilike'))).toBe(true);
    const result = await response.json();
    expect(result.data.every((person: { email: string | null }) => person.email === null)).toBe(true);
    expect(state.conditions).toContainEqual(['pending', false]);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('does not query candidates when both searchable fields are hidden', async () => {
    state.hidden = ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'];
    expect(await (await search()).json()).toEqual({ data: [] });
    expect(state.tables).toEqual(['workspace_secrets']);
  });

  it('fails closed when privacy policy cannot be read', async () => {
    state.policyError = true;
    const response = await search();
    expect(response.status).toBe(500);
    expect(state.tables).toEqual(['workspace_secrets']);
    expect(await response.json()).toEqual({ error: 'Unable to search people' });
  });
});
