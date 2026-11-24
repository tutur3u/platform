import type { WorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/protocol';
import { configureWorkspaceSecretsRuntime } from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspaceSecretsAccessMock } = vi.hoisted(() => ({
  getWorkspaceSecretsAccessMock: vi.fn(),
}));

vi.mock('./access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));
vi.mock('@/lib/workspace-secrets/managed-cron', () => ({
  canMutateManagedCronEnableSecret: vi.fn().mockResolvedValue(false),
  createManagedCronSecretAdminClient: vi.fn(),
  isManagedCronEnableSecretName: () => false,
}));

import { PUT } from './[secretId]/route';
import { POST } from './route';

const WS = '39150000-0000-4000-8000-0000000000a1';
const SECRET = '39150000-0000-4000-8000-0000000000c1';
const MARKER = 'synthetic-credential-marker';

function fakeBinding(
  overrides: Partial<WorkspaceSecretsBinding> = {}
): WorkspaceSecretsBinding {
  const ok = {
    last4: '',
    secretId: SECRET,
    status: 'ok' as const,
    valueRev: 1,
  };
  return {
    keyStatus: vi.fn(),
    put: vi.fn().mockResolvedValue(ok),
    rename: vi.fn().mockResolvedValue(ok),
    reveal: vi.fn(),
    ...overrides,
  };
}

function db(existing: { name: string; value_rev?: number } | null = null) {
  const selects: string[] = [];
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({
    eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  }));
  const from = vi.fn(() => ({
    insert,
    select: (columns: string) => {
      selects.push(columns);
      return {
        eq: () => ({
          eq: () => ({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: existing, error: null }),
          }),
        }),
      };
    },
    update,
  }));
  getWorkspaceSecretsAccessMock.mockResolvedValue({
    allowed: true,
    db: { from },
    resolvedWsId: WS,
  });
  return { insert, selects, update };
}

const request = (body: unknown, method = 'POST') =>
  new Request('http://localhost', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });
const post = (body: unknown) =>
  POST(request(body), { params: Promise.resolve({ wsId: WS }) });
const put = (body: unknown) =>
  PUT(request(body, 'PUT'), {
    params: Promise.resolve({ secretId: SECRET, wsId: WS }),
  });

describe('generic Secrets routes with the workspace secrets Worker', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => configureWorkspaceSecretsRuntime(null));

  it('creates a credential through the Worker and writes no plaintext', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    const { insert } = db();
    const response = await post({
      name: 'DRIVE_R2_SECRET_ACCESS_KEY',
      value: MARKER,
    });
    expect(response.status).toBe(200);
    expect(binding.put).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DRIVE_R2_SECRET_ACCESS_KEY',
        value: MARKER,
        wsId: WS,
      })
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('keeps config values on the plaintext path', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    const { insert } = db();
    await post({ name: 'ENABLE_CHAT', value: 'true' });
    expect(insert).toHaveBeenCalled();
    expect(binding.put).not.toHaveBeenCalled();
  });

  it('uses the legacy plaintext path when no binding is installed', async () => {
    const { insert } = db();
    expect(
      (await post({ name: 'DRIVE_R2_SECRET_ACCESS_KEY', value: MARKER })).status
    ).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DRIVE_R2_SECRET_ACCESS_KEY',
        value: MARKER,
      })
    );
  });

  it.each(['AI_PROVIDER_KEY:openai', ' ai_provider_key:google '])(
    'refuses the reserved provider key name %s for every caller',
    async (name) => {
      configureWorkspaceSecretsRuntime(fakeBinding());
      const { insert } = db();
      expect((await post({ name, value: MARKER })).status).toBe(403);
      expect(insert).not.toHaveBeenCalled();
    }
  );

  it('keeps the unbound PUT identical: it never selects value_rev', async () => {
    // Production can serve this code before the step 1 migration adds the
    // column, so the row shape here has no value_rev.
    const { selects, update } = db({ name: 'X_TOKEN' });
    expect((await put({ name: 'X_TOKEN', value: MARKER })).status).toBe(200);
    expect(selects).toEqual(['name']);
    expect(update).toHaveBeenCalledWith({ name: 'X_TOKEN', value: MARKER });
  });

  it('replaces a credential with compare-and-swap on value_rev', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    const { update } = db({ name: 'X_TOKEN', value_rev: 4 });
    expect((await put({ name: 'X_TOKEN', value: MARKER })).status).toBe(200);
    expect(binding.put).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedValueRev: 4,
        name: 'X_TOKEN',
        secretId: SECRET,
        value: MARKER,
      })
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('renames a kept credential through the Worker', async () => {
    const binding = fakeBinding();
    configureWorkspaceSecretsRuntime(binding);
    const { update } = db({ name: 'X_TOKEN', value_rev: 2 });
    expect((await put({ keepValue: true, name: 'Y_TOKEN' })).status).toBe(200);
    expect(binding.rename).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedValueRev: 2,
        fromName: 'X_TOKEN',
        secretId: SECRET,
        toName: 'Y_TOKEN',
      })
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('answers 409 when the Worker reports a stale revision', async () => {
    configureWorkspaceSecretsRuntime(
      fakeBinding({
        put: vi
          .fn()
          .mockResolvedValue({ currentValueRev: 5, status: 'conflict' }),
      })
    );
    db({ name: 'X_TOKEN', value_rev: 4 });
    expect((await put({ name: 'X_TOKEN', value: MARKER })).status).toBe(409);
  });

  it('refuses to move a secret between tiers', async () => {
    configureWorkspaceSecretsRuntime(fakeBinding());
    const { update } = db({ name: 'X_TOKEN', value_rev: 1 });
    expect((await put({ name: 'ENABLE_X', value: 'true' })).status).toBe(400);
    db({ name: 'ENABLE_X', value_rev: 1 });
    expect((await put({ name: 'X_TOKEN', value: MARKER })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('fails closed with a 503 that carries no value when the Worker is unavailable', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    configureWorkspaceSecretsRuntime(
      fakeBinding({ put: vi.fn().mockResolvedValue({ status: 'unavailable' }) })
    );
    const { insert } = db();
    const response = await post({ name: 'X_TOKEN', value: MARKER });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(MARKER);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(MARKER);
    expect(insert).not.toHaveBeenCalled();
  });
});
