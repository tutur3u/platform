import type { WorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/protocol';
import { configureWorkspaceSecretsRuntime } from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PUT } from './[secretId]/route';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  rows: [] as Array<{
    id: string;
    name: string;
    value_rev: number;
    ws_id: string;
  }>,
}));
vi.mock('@/lib/managed-cron-secret', () => ({
  canMutateInfrastructureSecret: async () => true,
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureWorkspaceSecretsRequest: async () => {
    const filters: Record<string, unknown> = {};
    const query = {
      delete: mocks.write,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      insert: mocks.write,
      maybeSingle: async () => ({
        data:
          mocks.rows.find((row) =>
            Object.entries(filters).every(
              ([column, value]) => row[column as keyof typeof row] === value
            )
          ) ?? null,
        error: null,
      }),
      select: () => query,
      update: mocks.write,
    };
    mocks.write.mockReturnValue(query);
    return { ok: true, sbAdmin: { from: () => query }, user: { id: 'actor' } };
  },
}));

const WS = 'tenant';
const MARKER = 'synthetic-credential-marker';

function fakeBinding(overrides: Partial<WorkspaceSecretsBinding> = {}) {
  const ok = {
    last4: '',
    secretId: 'secret',
    status: 'ok' as const,
    valueRev: 1,
  };
  return {
    keyStatus: vi.fn(),
    put: vi.fn().mockResolvedValue(ok),
    rename: vi.fn().mockResolvedValue(ok),
    reveal: vi.fn(),
    ...overrides,
  } satisfies WorkspaceSecretsBinding;
}

const call = (
  handler: typeof POST | typeof PUT | typeof DELETE,
  body?: unknown
) =>
  handler(
    new Request('https://example.test/secrets', {
      body: body === undefined ? undefined : JSON.stringify(body),
      method: 'POST',
    }),
    { params: Promise.resolve({ secretId: 'secret', wsId: WS }) }
  );

describe('admin Secrets routes with the workspace secrets Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: 'secret', name: 'X_TOKEN', value_rev: 3, ws_id: WS }];
  });
  afterEach(() => configureWorkspaceSecretsRuntime(null));

  it('creates credentials through the Worker without a plaintext insert', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    expect(
      (await call(POST, { name: 'NEW_TOKEN', value: MARKER })).status
    ).toBe(200);
    expect(binding.put).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NEW_TOKEN', value: MARKER, wsId: WS })
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('keeps the legacy path without a binding', async () => {
    expect(
      (await call(POST, { name: 'NEW_TOKEN', value: MARKER })).status
    ).toBe(200);
    expect(mocks.write).toHaveBeenCalled();
  });

  it('replaces and renames credentials with the row revision', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    await call(PUT, { value: MARKER });
    expect(binding.put).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedValueRev: 3,
        name: 'X_TOKEN',
        secretId: 'secret',
      })
    );
    await call(PUT, { keepValue: true, name: 'Y_TOKEN' });
    expect(binding.rename).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedValueRev: 3,
        fromName: 'X_TOKEN',
        toName: 'Y_TOKEN',
      })
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('answers 409 on a stale revision and refuses tier changes', async () => {
    configureWorkspaceSecretsRuntime(
      fakeBinding({
        put: vi
          .fn()
          .mockResolvedValue({ currentValueRev: 4, status: 'conflict' }),
      })
    );
    expect((await call(PUT, { value: MARKER })).status).toBe(409);
    expect((await call(PUT, { name: 'ENABLE_X', value: 'true' })).status).toBe(
      400
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('refuses AI provider keys on create, update and delete', async () => {
    configureWorkspaceSecretsRuntime(fakeBinding());
    expect(
      (await call(POST, { name: 'AI_PROVIDER_KEY:openai', value: MARKER }))
        .status
    ).toBe(403);
    expect(
      (await call(PUT, { name: 'AI_PROVIDER_KEY:openai', value: MARKER }))
        .status
    ).toBe(403);
    mocks.rows = [
      { id: 'secret', name: 'AI_PROVIDER_KEY:google', value_rev: 0, ws_id: WS },
    ];
    expect((await call(DELETE)).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('fails closed with no value in the response when the Worker is down', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    configureWorkspaceSecretsRuntime(
      fakeBinding({ put: vi.fn().mockResolvedValue({ status: 'unavailable' }) })
    );
    const response = await call(POST, { name: 'NEW_TOKEN', value: MARKER });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(MARKER);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(MARKER);
  });
});
