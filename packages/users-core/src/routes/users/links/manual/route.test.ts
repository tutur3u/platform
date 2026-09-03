import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET, POST } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const VIRTUAL_USER_ID = '22222222-2222-4222-8222-222222222222';
const PLATFORM_USER_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_VIRTUAL_USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_PLATFORM_USER_ID = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface Filter {
  field: string;
  value: unknown;
}

interface Mutation {
  filters: Filter[];
  operation: 'delete' | 'insert' | 'update' | 'upsert';
  options?: unknown;
  payload?: unknown;
  table: string;
}

class SupabaseFixture {
  readonly mutations: Mutation[] = [];
  readonly responses = new Map<string, QueryResult[]>();
  readonly from = vi.fn((table: string) => new SupabaseQuery(table, this));
  readonly admin = { from: this.from };

  enqueue(table: string, ...responses: QueryResult[]) {
    const queue = this.responses.get(table) ?? [];
    queue.push(...responses);
    this.responses.set(table, queue);
  }

  consume(table: string): QueryResult {
    const response = this.responses.get(table)?.shift();
    if (!response) {
      throw new Error(`Unexpected query for ${table}`);
    }
    return response;
  }
}

class SupabaseQuery implements PromiseLike<QueryResult> {
  private readonly filters: Filter[] = [];
  private operation: Mutation['operation'] | 'select' = 'select';
  private options?: unknown;
  private payload?: unknown;
  private result?: Promise<QueryResult>;

  constructor(
    private readonly table: string,
    private readonly fixture: SupabaseFixture
  ) {}

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  in(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  insert(payload: unknown) {
    this.operation = 'insert';
    this.payload = payload;
    return this.execute();
  }

  maybeSingle() {
    return this.execute();
  }

  or(value: string) {
    this.filters.push({ field: 'or', value });
    return this.execute();
  }

  select(_columns: string) {
    return this;
  }

  // biome-ignore lint/suspicious/noThenProperty: Supabase builders are intentionally awaitable.
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  update(payload: unknown) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.operation = 'upsert';
    this.payload = payload;
    this.options = options;
    return this.execute();
  }

  private execute() {
    this.result ??= Promise.resolve().then(() => {
      if (this.operation !== 'select') {
        this.fixture.mutations.push({
          filters: [...this.filters],
          operation: this.operation,
          options: this.options,
          payload: this.payload,
          table: this.table,
        });
      }
      return this.fixture.consume(this.table);
    });
    return this.result;
  }
}

let fixture: SupabaseFixture;

function authorize(...permissions: string[]) {
  const allowed = new Set(permissions);
  mocks.getPermissions.mockResolvedValue({
    withoutPermission: (permission: string) => !allowed.has(permission),
  });
}

function enqueueContainedProfiles(
  virtualUser: unknown = { id: VIRTUAL_USER_ID },
  member: unknown = { user_id: PLATFORM_USER_ID }
) {
  fixture.enqueue('workspace_users', { data: virtualUser, error: null });
  fixture.enqueue('workspace_members', { data: member, error: null });
}

function enqueueConsolidationReads({
  group = { id: GROUP_ID },
  sourceMembership = {
    group_id: GROUP_ID,
    role: 'TEACHER',
    user_id: VIRTUAL_USER_ID,
  },
  targetMembership = null,
  targetVirtualUser = { id: TARGET_VIRTUAL_USER_ID },
}: {
  group?: unknown;
  sourceMembership?: unknown;
  targetMembership?: unknown;
  targetVirtualUser?: unknown;
} = {}) {
  fixture.enqueue('workspace_user_groups', { data: group, error: null });
  fixture.enqueue(
    'workspace_user_groups_users',
    { data: sourceMembership, error: null },
    { data: targetMembership, error: null }
  );
  fixture.enqueue('workspace_users', {
    data: targetVirtualUser,
    error: null,
  });
}

function postRequest(body: unknown = {}) {
  return new Request(
    `https://contacts.tuturuuu.com/api/v1/workspaces/personal/users/links/manual`,
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

async function post(body: unknown) {
  const response = await POST(postRequest(body), {
    params: Promise.resolve({ wsId: 'personal' }),
  });
  if (!response) throw new Error('POST handler returned no response');
  return response;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    platformUserId: PLATFORM_USER_ID,
    virtualUserId: VIRTUAL_USER_ID,
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('manual profile linking route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture = new SupabaseFixture();
    authorize('update_users', 'view_users_public_info');
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.createAdminClient.mockResolvedValue(fixture.admin);
  });

  it('returns 404 without route access and creates no admin client', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    const response = await post(validBody());

    expect(response.status).toBe(404);
    expect(await responseJson(response)).toEqual({ error: 'Not found' });
    expect(mocks.resolveWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(fixture.mutations).toEqual([]);
  });

  it.each([
    ['update_users', ['view_users_public_info']],
    ['view_users_public_info', ['update_users']],
  ])(
    'returns 403 without %s and creates no admin client',
    async (_missingPermission, permissions) => {
      authorize(...permissions);

      const response = await post(validBody());

      expect(response.status).toBe(403);
      expect(await responseJson(response)).toEqual({
        error: 'Insufficient permissions to link user profiles',
      });
      expect(mocks.resolveWorkspaceId).not.toHaveBeenCalled();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(fixture.mutations).toEqual([]);
    }
  );

  it('rejects an invalid body before authorization or admin access', async () => {
    const response = await post({ platformUserId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toMatchObject({
      error: 'Invalid request body',
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(fixture.mutations).toEqual([]);
  });

  it.each([
    ['virtual user', null, { user_id: PLATFORM_USER_ID }],
    ['workspace member', { id: VIRTUAL_USER_ID }, null],
  ])(
    'rejects a missing %s containment check without mutations',
    async (_profile, virtualUser, member) => {
      enqueueContainedProfiles(virtualUser, member);

      const response = await post(validBody());

      expect(response.status).toBe(400);
      expect(await responseJson(response)).toEqual({
        error: 'Both profiles must belong to this workspace',
      });
      expect(fixture.mutations).toEqual([]);
    }
  );

  it('inserts an ordinary link after both containment reads', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', { data: [], error: null });
    fixture.enqueue('workspace_user_linked_users', { error: null });

    const response = await post(validBody());

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      alreadyLinked: false,
      success: true,
    });
    expect(fixture.mutations).toEqual([
      {
        filters: [],
        operation: 'insert',
        options: undefined,
        payload: {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: VIRTUAL_USER_ID,
          ws_id: WORKSPACE_ID,
        },
        table: 'workspace_user_linked_users',
      },
    ]);
  });

  it('returns exact-link idempotency without mutations', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [
        {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: VIRTUAL_USER_ID,
        },
      ],
      error: null,
    });

    const response = await post(validBody());

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      alreadyLinked: true,
      success: true,
    });
    expect(fixture.mutations).toEqual([]);
  });

  it.each([
    [
      'platform conflict',
      {
        platform_user_id: PLATFORM_USER_ID,
        virtual_user_id: TARGET_VIRTUAL_USER_ID,
      },
    ],
    [
      'virtual conflict',
      {
        platform_user_id: OTHER_PLATFORM_USER_ID,
        virtual_user_id: VIRTUAL_USER_ID,
      },
    ],
  ])('returns 409 for a %s without mutations', async (_conflict, link) => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [link],
      error: null,
    });

    const response = await post(validBody());

    expect(response.status).toBe(409);
    expect(await responseJson(response)).toEqual({
      error: 'One of these profiles is already linked',
    });
    expect(fixture.mutations).toEqual([]);
  });

  it.each([
    ['group', { group: null }],
    ['source assignment', { sourceMembership: null }],
    ['target virtual user', { targetVirtualUser: null }],
  ])(
    'returns 409 when the %s disappears before consolidation',
    async (_missingState, readOverrides) => {
      enqueueContainedProfiles();
      fixture.enqueue('workspace_user_linked_users', {
        data: [
          {
            platform_user_id: PLATFORM_USER_ID,
            virtual_user_id: TARGET_VIRTUAL_USER_ID,
          },
        ],
        error: null,
      });
      enqueueConsolidationReads(readOverrides);

      const response = await post(validBody({ groupId: GROUP_ID }));

      expect(response.status).toBe(409);
      expect(await responseJson(response)).toEqual({
        error: 'Manager assignment is no longer available',
      });
      expect(fixture.mutations).toEqual([]);
    }
  );

  it('consolidates a teacher assignment in upsert-then-delete order', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [
        {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: TARGET_VIRTUAL_USER_ID,
        },
      ],
      error: null,
    });
    enqueueConsolidationReads();
    fixture.enqueue(
      'workspace_user_groups_users',
      { error: null },
      { error: null }
    );

    const response = await post(validBody({ groupId: GROUP_ID }));

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      alreadyLinked: false,
      consolidated: true,
      success: true,
      targetVirtualUserId: TARGET_VIRTUAL_USER_ID,
    });
    expect(fixture.mutations).toEqual([
      {
        filters: [],
        operation: 'upsert',
        options: { onConflict: 'group_id,user_id' },
        payload: {
          group_id: GROUP_ID,
          role: 'TEACHER',
          user_id: TARGET_VIRTUAL_USER_ID,
        },
        table: 'workspace_user_groups_users',
      },
      {
        filters: [
          { field: 'group_id', value: GROUP_ID },
          { field: 'user_id', value: VIRTUAL_USER_ID },
          { field: 'role', value: 'TEACHER' },
        ],
        operation: 'delete',
        options: undefined,
        payload: undefined,
        table: 'workspace_user_groups_users',
      },
    ]);
  });

  it('returns a sanitized 500 and does not delete when consolidation upsert fails', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [
        {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: TARGET_VIRTUAL_USER_ID,
        },
      ],
      error: null,
    });
    enqueueConsolidationReads();
    fixture.enqueue('workspace_user_groups_users', {
      error: new Error('synthetic raw upsert detail'),
    });

    const response = await post(validBody({ groupId: GROUP_ID }));
    const body = await responseJson(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to link user profiles' });
    expect(JSON.stringify(body)).not.toContain('synthetic raw upsert detail');
    expect(fixture.mutations).toHaveLength(1);
    expect(fixture.mutations[0]?.operation).toBe('upsert');
  });

  it('restores the pre-existing target role when source deletion fails', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [
        {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: TARGET_VIRTUAL_USER_ID,
        },
      ],
      error: null,
    });
    enqueueConsolidationReads({
      targetMembership: {
        group_id: GROUP_ID,
        role: 'STUDENT',
        user_id: TARGET_VIRTUAL_USER_ID,
      },
    });
    fixture.enqueue(
      'workspace_user_groups_users',
      { error: null },
      { error: new Error('synthetic source delete failure') },
      { error: null }
    );

    const response = await post(validBody({ groupId: GROUP_ID }));

    expect(response.status).toBe(500);
    expect(await responseJson(response)).toEqual({
      error: 'Failed to link user profiles',
    });
    expect(fixture.mutations.map(({ operation }) => operation)).toEqual([
      'upsert',
      'delete',
      'update',
    ]);
    expect(fixture.mutations[2]).toMatchObject({
      filters: [
        { field: 'group_id', value: GROUP_ID },
        { field: 'user_id', value: TARGET_VIRTUAL_USER_ID },
      ],
      operation: 'update',
      payload: { role: 'STUDENT' },
    });
  });

  it('deletes a newly created target assignment when source deletion fails', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: [
        {
          platform_user_id: PLATFORM_USER_ID,
          virtual_user_id: TARGET_VIRTUAL_USER_ID,
        },
      ],
      error: null,
    });
    enqueueConsolidationReads();
    fixture.enqueue(
      'workspace_user_groups_users',
      { error: null },
      { error: new Error('synthetic source delete failure') },
      { error: null }
    );

    const response = await post(validBody({ groupId: GROUP_ID }));

    expect(response.status).toBe(500);
    expect(await responseJson(response)).toEqual({
      error: 'Failed to link user profiles',
    });
    expect(fixture.mutations.map(({ operation }) => operation)).toEqual([
      'upsert',
      'delete',
      'delete',
    ]);
    expect(fixture.mutations[2]).toMatchObject({
      filters: [
        { field: 'group_id', value: GROUP_ID },
        { field: 'user_id', value: TARGET_VIRTUAL_USER_ID },
      ],
      operation: 'delete',
    });
  });

  it('maps an unexpected link read error to a sanitized 500', async () => {
    enqueueContainedProfiles();
    fixture.enqueue('workspace_user_linked_users', {
      data: null,
      error: new Error('synthetic private read detail'),
    });

    const response = await post(validBody());
    const body = await responseJson(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to link user profiles' });
    expect(JSON.stringify(body)).not.toContain('synthetic private read detail');
    expect(fixture.mutations).toEqual([]);
  });

  it('maps an unexpected candidate read error to a sanitized 500', async () => {
    fixture.enqueue('workspace_users', {
      data: { email: 'virtual@example.test', id: VIRTUAL_USER_ID },
      error: null,
    });
    fixture.enqueue('workspace_members', {
      data: null,
      error: new Error('synthetic private candidate detail'),
    });
    fixture.enqueue('workspace_user_linked_users', {
      data: [],
      error: null,
    });

    const response = await GET(
      new Request(
        `https://contacts.tuturuuu.com/api/v1/workspaces/personal/users/links/manual?virtualUserId=${VIRTUAL_USER_ID}`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );
    if (!response) throw new Error('GET handler returned no response');
    const body = await responseJson(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to load link candidates' });
    expect(JSON.stringify(body)).not.toContain(
      'synthetic private candidate detail'
    );
    expect(fixture.mutations).toEqual([]);
  });
});
