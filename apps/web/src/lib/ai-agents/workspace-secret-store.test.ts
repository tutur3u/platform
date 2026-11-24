import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type {
  WorkspaceSecretPutInput,
  WorkspaceSecretPutResult,
  WorkspaceSecretRevealInput,
  WorkspaceSecretRevealResult,
  WorkspaceSecretsBinding,
} from '@tuturuuu/utils/workspace-secrets/protocol';
import { configureWorkspaceSecretsRuntime } from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('tests pass an explicit client');
  }),
}));

import { getChannelSecretValues } from './agent-registry';
import { saveAiAgent } from './agent-save';
import { channelMetaKey, channelSecretKey } from './registry-codec';
import {
  readSecretRows,
  replaceSecretRows,
  revealRootCredential,
} from './workspace-secret-store';

type Row = {
  id: string;
  name: string;
  value: string | null;
  value_rev: number;
  ws_id: string;
};

const META = channelMetaKey('support', 'discord-main');
const TOKEN = channelSecretKey('support', 'discord-main', 'botToken');
const KEY = channelSecretKey('support', 'discord-main', 'publicKey');

function row(name: string, value: string | null, valueRev = 0): Row {
  return {
    id: `id-${name.split(':').at(-1)}`,
    name,
    value,
    value_rev: valueRev,
    ws_id: ROOT_WORKSPACE_ID,
  };
}

function fakeDb(initial: Row[]) {
  const table = [...initial];
  const calls = {
    deletes: [] as string[][],
    inserts: [] as Array<Array<Pick<Row, 'name' | 'value'>>>,
    selects: [] as string[],
  };

  function query(op: 'delete' | 'select', columns: string[] = []) {
    const filters: Array<(entry: Row) => boolean> = [];
    const run = () => {
      const match = table.filter((entry) => filters.every((f) => f(entry)));
      if (op === 'delete') {
        calls.deletes.push(match.map((entry) => entry.name));
        for (const entry of match) table.splice(table.indexOf(entry), 1);
        return { data: null, error: null };
      }
      return {
        data: match.map((entry) =>
          Object.fromEntries(
            columns.map((column) => [column, entry[column as keyof Row]])
          )
        ),
        error: null,
      };
    };
    const builder = {
      eq: (column: keyof Row, value: unknown) => {
        filters.push((entry) => entry[column] === value);
        return builder;
      },
      in: (column: keyof Row, values: unknown[]) => {
        filters.push((entry) => values.includes(entry[column]));
        return builder;
      },
      like: (column: keyof Row, pattern: string) => {
        const prefix = pattern.replace(/%$/u, '');
        filters.push((entry) => String(entry[column]).startsWith(prefix));
        return builder;
      },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (
        resolve: (value: ReturnType<typeof run>) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  }

  const db = {
    from: () => ({
      delete: () => query('delete'),
      insert: async (rows: Array<Pick<Row, 'name' | 'value'>>) => {
        calls.inserts.push(rows);
        table.push(...rows.map((entry) => row(entry.name, entry.value)));
        return { error: null };
      },
      select: (columns: string) => {
        calls.selects.push(columns);
        return query(
          'select',
          columns.split(',').map((column) => column.trim())
        );
      },
    }),
  } as unknown as TypedSupabaseClient;

  return { calls, db, table };
}

function fakeBinding({
  put = async () => ({
    last4: '',
    secretId: 'new-id',
    status: 'ok',
    valueRev: 1,
  }),
  reveal = async () => ({ status: 'not_found' }),
}: {
  put?: (input: WorkspaceSecretPutInput) => Promise<WorkspaceSecretPutResult>;
  reveal?: (
    input: WorkspaceSecretRevealInput
  ) => Promise<WorkspaceSecretRevealResult>;
} = {}) {
  const binding = {
    keyStatus: vi.fn(),
    put: vi.fn(put),
    rename: vi.fn(),
    reveal: vi.fn(reveal),
  } satisfies WorkspaceSecretsBinding;
  configureWorkspaceSecretsRuntime(binding);
  return binding;
}

const insertedNames = (calls: ReturnType<typeof fakeDb>['calls']) =>
  calls.inserts.flat().map((entry) => entry.name);

afterEach(() => {
  configureWorkspaceSecretsRuntime(null);
});

describe('AI agent workspace secret store without a binding', () => {
  it('reads and rewrites plaintext rows as before', async () => {
    const { calls, db } = fakeDb([row(META, '{}'), row(TOKEN, 'token-1234')]);

    await expect(
      readSecretRows({ db, prefix: 'AI_AGENT_REGISTRY' })
    ).resolves.toEqual([
      { name: META, value: '{}' },
      { name: TOKEN, value: 'token-1234' },
    ]);
    expect(calls.selects).toEqual(['name, value']);

    await replaceSecretRows({
      db,
      names: [META, TOKEN],
      rows: [
        { name: META, value: '{"a":1}' },
        { name: TOKEN, value: 'token-5678' },
      ],
    });
    expect(calls.deletes).toEqual([[META, TOKEN]]);
    expect(insertedNames(calls)).toEqual([META, TOKEN]);
  });

  it('reads root credentials and channel secrets as plaintext', async () => {
    const { db } = fakeDb([row(TOKEN, 'token-1234')]);

    await expect(revealRootCredential(TOKEN, 'ai-agents', db)).resolves.toBe(
      'token-1234'
    );
    await expect(
      getChannelSecretValues({
        agentId: 'support',
        channelId: 'discord-main',
        db,
      })
    ).resolves.toEqual({ botToken: 'token-1234' });
  });
});

describe('AI agent workspace secret store with a binding', () => {
  it('withholds credential values on bulk reads', async () => {
    fakeBinding();
    const { db } = fakeDb([
      row(META, '{}'),
      row(TOKEN, null, 3),
      row(KEY, 'legacy-key'),
    ]);

    await expect(
      readSecretRows({ db, prefix: 'AI_AGENT_REGISTRY' })
    ).resolves.toEqual([
      { name: META, value: '{}' },
      { name: TOKEN, stored: true, value: null },
      { name: KEY, stored: true, value: null },
    ]);
  });

  it('writes credential rows through the Worker and nothing else', async () => {
    const binding = fakeBinding();
    const { calls, db } = fakeDb([
      row(META, '{}'),
      row(TOKEN, null, 3),
      row(KEY, null, 1),
    ]);
    const created = channelSecretKey(
      'support',
      'discord-main',
      'applicationId'
    );

    await replaceSecretRows({
      db,
      names: [META, TOKEN, KEY],
      rows: [
        { name: META, value: '{"a":1}' },
        { name: TOKEN, value: 'token-5678' },
        { name: created, value: 'app-1' },
      ],
    });

    expect(insertedNames(calls)).toEqual([META]);
    expect(calls.deletes).toEqual([[META], [KEY]]);
    expect(binding.put.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        expectedValueRev: 3,
        name: TOKEN,
        secretId: `id-botToken`,
        value: 'token-5678',
        wsId: ROOT_WORKSPACE_ID,
      }),
      expect.objectContaining({ name: created, value: 'app-1' }),
    ]);
    expect(binding.put.mock.calls[1]?.[0]).not.toHaveProperty('secretId');
    expect(binding.put.mock.calls[1]?.[0]).not.toHaveProperty(
      'expectedValueRev'
    );
  });

  it('fails closed when the Worker refuses a write', async () => {
    fakeBinding({
      put: async () => ({ currentValueRev: 4, status: 'conflict' }),
    });
    const { calls, db } = fakeDb([row(TOKEN, null, 3)]);

    await expect(
      replaceSecretRows({
        db,
        names: [TOKEN],
        rows: [{ name: TOKEN, value: 'token-5678' }],
      })
    ).rejects.toThrow('workspace_secrets_conflict');
    expect(insertedNames(calls)).toEqual([]);
    expect(calls.deletes.flat()).toEqual([]);
  });

  it('reveals root credentials for the given purpose without a plaintext read', async () => {
    const binding = fakeBinding({
      reveal: async () => ({ status: 'ok', value: 'redis://x', valueRev: 1 }),
    });
    const { calls, db } = fakeDb([row(TOKEN, 'plaintext')]);

    await expect(
      revealRootCredential('AI_AGENT_CHAT_SDK_STATE_REDIS_URL', 'ai-agents', db)
    ).resolves.toBe('redis://x');
    expect(binding.reveal).toHaveBeenCalledWith({
      name: 'AI_AGENT_CHAT_SDK_STATE_REDIS_URL',
      purpose: 'ai-agents',
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(calls.selects).toEqual([]);

    binding.reveal.mockResolvedValueOnce({ status: 'unavailable' });
    await expect(
      revealRootCredential('AI_AGENT_CHAT_SDK_STATE_REDIS_URL', 'ai-agents', db)
    ).rejects.toThrow('workspace_secrets_unavailable');
    expect(calls.selects).toEqual([]);
  });

  it('reveals each stored channel secret for the ai-agents purpose', async () => {
    const binding = fakeBinding({
      reveal: async () => ({ status: 'ok', value: 'token-1234', valueRev: 3 }),
    });
    const { db } = fakeDb([row(TOKEN, null, 3)]);

    await expect(
      getChannelSecretValues({
        agentId: 'support',
        channelId: 'discord-main',
        db,
      })
    ).resolves.toEqual({ botToken: 'token-1234' });
    expect(binding.reveal).toHaveBeenCalledWith({
      name: TOKEN,
      purpose: 'ai-agents',
      wsId: ROOT_WORKSPACE_ID,
    });

    binding.reveal.mockResolvedValueOnce({ status: 'forbidden' });
    await expect(
      getChannelSecretValues({
        agentId: 'support',
        channelId: 'discord-main',
        db,
      })
    ).rejects.toThrow('workspace_secrets_forbidden');
  });

  it('keeps unchanged Worker-held secrets in place when saving an agent', async () => {
    const binding = fakeBinding();
    const { calls, db } = fakeDb([
      row('AI_AGENT_REGISTRY:support:meta', '{"name":"Support"}'),
      row(META, JSON.stringify({ adapter: 'discord', id: 'discord-main' })),
      row(TOKEN, null, 3),
    ]);

    await saveAiAgent({
      actorUserId: 'user-1',
      db,
      payload: {
        channels: [
          {
            adapter: 'discord',
            id: 'discord-main',
            secrets: { publicKey: 'public-key-1' },
            workspaceId: ROOT_WORKSPACE_ID,
          },
        ],
        id: 'support',
        name: 'Support',
      },
    });

    expect(calls.deletes.flat()).not.toContain(TOKEN);
    expect(insertedNames(calls)).not.toContain(TOKEN);
    expect(insertedNames(calls)).not.toContain(KEY);
    expect(binding.put).toHaveBeenCalledTimes(1);
    expect(binding.put.mock.calls[0]?.[0]).toMatchObject({
      name: KEY,
      value: 'public-key-1',
    });
  });
});
