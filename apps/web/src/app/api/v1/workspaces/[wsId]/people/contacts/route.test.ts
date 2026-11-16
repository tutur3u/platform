import { contactOperationId } from '@tuturuuu/utils/contact-create-operation';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

const state = vi.hoisted(() => ({
  actorId: 'actor',
  workspaceId: 'workspace',
  authenticated: true,
  member: true,
  create: true,
  rows: new Map<
    string,
    { id: string; email: string; display_name: string | null }
  >(),
  adminCalls: 0,
  rpcCalls: [] as unknown[],
  filters: [] as [string, unknown][],
  configurations: [] as unknown[],
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    state.adminCalls++;
    return {
      from: () => {
        let id = '';
        let ws = '';
        const query = {
          select: () => query,
          eq: (key: string, value: string) => {
            state.filters.push([key, value]);
            if (key === 'id') id = value;
            if (key === 'ws_id') ws = value;
            return query;
          },
          maybeSingle: async () => ({
            data: ws === 'workspace' ? (state.rows.get(id) ?? null) : null,
            error: null,
          }),
        };
        return query;
      },
      rpc: async (
        name: string,
        args: {
          p_ws_id: string;
          p_actor_auth_uid: string;
          p_payload: { id: string; email: string; display_name: string | null };
        }
      ) => {
        state.rpcCalls.push([name, args]);
        state.rows.set(args.p_payload.id, args.p_payload);
        return { data: args.p_payload, error: null };
      },
    };
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: state.member }),
  getPermissions: async () => ({
    containsPermission: (permission: string) =>
      permission === 'create_users' && state.create,
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => state.workspaceId,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (...args: unknown[]) => Promise<Response>,
    options: unknown
  ) => {
    state.configurations.push(options);
    return async (
      request: NextRequest,
      context: { params: Promise<{ wsId: string }> }
    ) =>
      state.authenticated
        ? handler(
            request,
            { user: { id: state.actorId }, supabase: {} },
            await context.params
          )
        : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  },
}));

import { GET, POST } from './route';

const operationId = 'b0abbf4c-f289-49ab-8b7a-26aed0a643d6';
const body = {
  operationId,
  email: 'SENDER@example.com',
  displayName: ' Sender ',
};
const params = { params: Promise.resolve({ wsId: 'workspace-alias' }) };
function request(
  method: 'GET' | 'POST',
  input: unknown = body,
  operation?: string
) {
  const url = new URL(
    'https://internal.example/api/v1/workspaces/workspace-alias/people/contacts'
  );
  if (operation) url.searchParams.set('operationId', operation);
  return new NextRequest(url, {
    method,
    ...(method === 'POST' ? { body: JSON.stringify(input) } : {}),
  });
}

beforeEach(() => {
  Object.assign(state, {
    actorId: 'actor',
    workspaceId: 'workspace',
    authenticated: true,
    member: true,
    create: true,
    adminCalls: 0,
  });
  state.rows.clear();
  state.rpcCalls.length = 0;
  state.filters.length = 0;
});

describe('Mail contact create adapter', () => {
  it('accepts only the configured Mail satellite session audience and bounded requests', () => {
    expect(state.configurations).toHaveLength(2);
    for (const options of state.configurations)
      expect(options).toMatchObject({
        allowAppSessionAuth: { targetApp: ['mail'] },
        maxPayloadSize: 4096,
        rateLimit: { maxRequests: 20, windowMs: 60000 },
      });
  });

  it.each(['anonymous', 'non-member', 'no-create-permission'])(
    'denies %s before opening the handler contact-operation store',
    async (mode) => {
      state.authenticated = mode !== 'anonymous';
      state.member = mode !== 'non-member';
      state.create = mode !== 'no-create-permission';
      expect((await POST(request('POST'), params)).status).toBe(
        mode === 'anonymous' ? 401 : mode === 'non-member' ? 404 : 403
      );
      expect(state.adminCalls).toBe(0);
      expect(state.rpcCalls).toHaveLength(0);
    }
  );

  it('checks capability without opening an admin client', async () => {
    expect(await (await GET(request('GET'), params)).json()).toEqual({
      canCreate: true,
    });
    expect(state.adminCalls).toBe(0);
  });

  it('uses the audited RPC with a server-derived identity and normalized workspace', async () => {
    const contactId = contactOperationId({
      actorId: 'actor',
      workspaceId: 'workspace',
      operationId,
    });
    const response = await POST(request('POST'), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ state: 'created', contactId });
    expect(state.rpcCalls).toEqual([
      [
        'admin_create_workspace_user_with_audit_actor',
        {
          p_ws_id: 'workspace',
          p_actor_auth_uid: 'actor',
          p_payload: {
            id: contactId,
            email: 'sender@example.com',
            display_name: 'Sender',
          },
        },
      ],
    ]);
    expect(state.filters).toContainEqual(['ws_id', 'workspace']);
    expect(state.filters).toContainEqual(['id', contactId]);
    await POST(request('POST'), params);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('reconciles only this actor and workspace operation, with no contact fields or writes', async () => {
    await POST(request('POST'), params);
    const contactId = contactOperationId({
      actorId: 'actor',
      workspaceId: 'workspace',
      operationId,
    });
    expect(
      await (await GET(request('GET', null, operationId), params)).json()
    ).toEqual({ state: 'created', contactId });
    state.actorId = 'other-actor';
    expect(
      await (await GET(request('GET', null, operationId), params)).json()
    ).toEqual({ state: 'unknown' });
    state.actorId = 'actor';
    state.workspaceId = 'other-workspace';
    expect(
      await (await GET(request('GET', null, operationId), params)).json()
    ).toEqual({ state: 'unknown' });
    expect(state.rpcCalls).toHaveLength(1);
  });

  it.each([
    { ...body, actorId: 'forged' },
    { ...body, is_guest: true },
    { ...body, operationId: 'bad' },
  ])('rejects invalid or additional mutation fields', async (input) => {
    expect((await POST(request('POST', input), params)).status).toBe(400);
    expect(state.adminCalls).toBe(0);
  });
});
