import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

type QueryResult = {
  data: unknown;
  error: unknown;
};

const mocks = vi.hoisted(() => {
  const adminQueues = new Map<string, QueryResult[]>();
  const privateQueues = new Map<string, QueryResult[]>();
  const rpcQueues = new Map<string, QueryResult[]>();
  const privateMutations: Array<{
    operation: string;
    table: string;
    value: unknown;
  }> = [];

  function dequeue(queues: Map<string, QueryResult[]>, key: string) {
    return queues.get(key)?.shift() ?? { data: null, error: null };
  }

  function createQuery(
    table: string,
    result: QueryResult,
    mutations = privateMutations
  ) {
    const query = {
      delete: vi.fn(() => {
        mutations.push({ operation: 'delete', table, value: null });
        return query;
      }),
      eq: vi.fn(() => query),
      insert: vi.fn((value: unknown) => {
        mutations.push({ operation: 'insert', table, value });
        return query;
      }),
      is: vi.fn(() => query),
      lt: vi.fn(() => query),
      maybeSingle: vi.fn(async () => result),
      select: vi.fn(() => query),
      single: vi.fn(async () => result),
      update: vi.fn((value: unknown) => {
        mutations.push({ operation: 'update', table, value });
        return query;
      }),
      upsert: vi.fn(async (value: unknown) => {
        mutations.push({ operation: 'upsert', table, value });
        return result;
      }),
    };

    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    });

    return query;
  }

  const privateClient = {
    from: vi.fn((table: string) =>
      createQuery(table, dequeue(privateQueues, table))
    ),
  };
  const adminClient = {
    from: vi.fn((table: string) =>
      createQuery(table, dequeue(adminQueues, table), [])
    ),
    rpc: vi.fn((name: string) => ({
      maybeSingle: vi.fn(async () => dequeue(rpcQueues, name)),
    })),
    schema: vi.fn(() => privateClient),
  };
  const requestClient = {};

  return {
    adminClient,
    adminQueues,
    privateClient,
    privateMutations,
    privateQueues,
    requestClient,
    rpcQueues,
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/utils/yjs-task-description', () => ({
  deriveTaskDescriptionYjsState: vi.fn(async () => [1, 2, 3]),
  isValidTaskDescriptionYjsState: vi.fn(async () => true),
}));

function queueResult(
  queues: Map<string, QueryResult[]>,
  key: string,
  result: QueryResult
) {
  queues.set(key, [...(queues.get(key) ?? []), result]);
}

function queueTaskAccess() {
  queueResult(mocks.adminQueues, 'tasks', {
    data: {
      id: TASK_ID,
      task_lists: {
        workspace_boards: {
          ws_id: WORKSPACE_ID,
        },
      },
    },
    error: null,
  });
}

function patchRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/tasks/${TASK_ID}/description`,
    {
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

const TASK_ID = '00000000-0000-4000-8000-000000000123';
const USER_ID = '00000000-0000-4000-8000-000000000999';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000456';
const params = {
  params: Promise.resolve({
    taskId: TASK_ID,
    wsId: WORKSPACE_ID,
  }),
};

async function callPatch(request: NextRequest) {
  const response = await PATCH(request, params);
  if (!response) {
    throw new Error('Expected PATCH to return a response');
  }
  return response;
}

describe('task description route chunked PATCH', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.adminQueues.clear();
    mocks.privateQueues.clear();
    mocks.rpcQueues.clear();
    mocks.privateMutations.length = 0;

    vi.mocked(createAdminClient).mockResolvedValue(mocks.adminClient as never);
    vi.mocked(createClient).mockResolvedValue(mocks.requestClient as never);
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    } as never);
    vi.mocked(normalizeWorkspaceId).mockResolvedValue(WORKSPACE_ID);
    vi.mocked(verifyWorkspaceMembershipType).mockResolvedValue({ ok: true });
  });

  it('returns 400 for malformed JSON after access checks', async () => {
    queueTaskAccess();

    const response = await callPatch(patchRequest('{'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request data',
    });
    expect(mocks.adminClient.rpc).not.toHaveBeenCalled();
  });

  it('begins a chunk session for declared fields', async () => {
    queueTaskAccess();
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: null,
      error: null,
    });
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: { id: '00000000-0000-4000-8000-000000000abc' },
      error: null,
    });

    const response = await callPatch(
      patchRequest({
        action: 'begin',
        fields: {
          description: {
            chunk_count: 2,
            total_length: 12,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session_id: '00000000-0000-4000-8000-000000000abc',
    });
    expect(mocks.privateMutations).toContainEqual({
      operation: 'insert',
      table: 'task_description_chunk_sessions',
      value: expect.objectContaining({
        task_id: TASK_ID,
        user_id: USER_ID,
      }),
    });
  });

  it('rejects append chunks outside the declared range', async () => {
    queueTaskAccess();
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: {
        fields: {
          description: {
            chunk_count: 1,
            total_length: 5,
          },
        },
        id: '00000000-0000-4000-8000-000000000abc',
        task_id: TASK_ID,
        user_id: USER_ID,
      },
      error: null,
    });

    const response = await callPatch(
      patchRequest({
        action: 'append',
        chunk: 'hello',
        chunk_index: 1,
        field: 'description',
        session_id: '00000000-0000-4000-8000-000000000abc',
      })
    );

    expect(response.status).toBe(400);
    expect(
      mocks.privateMutations.some((mutation) => mutation.operation === 'upsert')
    ).toBe(false);
  });

  it('assembles committed chunks and persists through the actor RPC', async () => {
    const description = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chunked description' }],
        },
      ],
    });
    const firstChunk = description.slice(0, 25);
    const secondChunk = description.slice(25);

    queueTaskAccess();
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: {
        fields: {
          description: {
            chunk_count: 2,
            total_length: description.length,
          },
        },
        id: '00000000-0000-4000-8000-000000000abc',
        task_id: TASK_ID,
        user_id: USER_ID,
      },
      error: null,
    });
    queueResult(mocks.privateQueues, 'task_description_chunks', {
      data: [
        { chunk: secondChunk, chunk_index: 1, field: 'description' },
        { chunk: firstChunk, chunk_index: 0, field: 'description' },
      ],
      error: null,
    });
    queueResult(mocks.rpcQueues, 'update_task_fields_with_actor', {
      data: {
        description,
        description_yjs_state: [1, 2, 3],
        id: TASK_ID,
      },
      error: null,
    });
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: null,
      error: null,
    });

    const response = await callPatch(
      patchRequest({
        action: 'commit',
        session_id: '00000000-0000-4000-8000-000000000abc',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      description,
      description_yjs_state: [1, 2, 3],
    });
    expect(mocks.adminClient.rpc).toHaveBeenCalledWith(
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_actor_user_id: USER_ID,
        p_task_id: TASK_ID,
        p_task_updates: expect.objectContaining({
          description,
        }),
      })
    );
  });

  it('rejects commit when declared chunks are missing', async () => {
    queueTaskAccess();
    queueResult(mocks.privateQueues, 'task_description_chunk_sessions', {
      data: {
        fields: {
          description: {
            chunk_count: 2,
            total_length: 10,
          },
        },
        id: '00000000-0000-4000-8000-000000000abc',
        task_id: TASK_ID,
        user_id: USER_ID,
      },
      error: null,
    });
    queueResult(mocks.privateQueues, 'task_description_chunks', {
      data: [{ chunk: 'hello', chunk_index: 0, field: 'description' }],
      error: null,
    });

    const response = await callPatch(
      patchRequest({
        action: 'commit',
        session_id: '00000000-0000-4000-8000-000000000abc',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.adminClient.rpc).not.toHaveBeenCalled();
  });
});
