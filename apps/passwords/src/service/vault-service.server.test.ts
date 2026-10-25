// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { passwordsFixture } from '@tuturuuu/storage-core/vault/passwords-test-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordsDatabase } from './database.server';
import type { PasswordsEnvironment } from './environment';
import {
  createPasswordsService,
  passwordsStepUpUrl,
} from './vault-service.server';

describe('Passwords service with signed claims and real crypto', () => {
  const actor = randomUUID();
  const env: PasswordsEnvironment = {
    ASSETS: { fetch: async () => new Response() },
    PASSWORDS_ENABLED: 'true',
    NEXT_PUBLIC_APP_URL: 'https://passwords.example.test',
    NEXT_PUBLIC_WEB_APP_URL: 'https://web.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-service-key',
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-secret',
    ENCRYPTION_MASTER_KEY: 'synthetic-passwords-engine-master',
  };
  let f: ReturnType<typeof passwordsFixture>;
  beforeEach(async () => {
    f = passwordsFixture();
    await f.initialize();
  });
  afterEach(() => vi.restoreAllMocks());
  const input = () => ({
    ...f.scope,
    requestId: randomUUID(),
    revision: Number(f.vault.revision),
    name: 'API_KEY',
    base64: Buffer.from('synthetic-value').toString('base64'),
  });

  function service(ageSeconds = 30, origin = env.NEXT_PUBLIC_APP_URL) {
    const token = createAppSessionToken(
      {
        targetApp: 'passwords',
        userId: actor,
        mfa: {
          sessionId: 'synthetic-proof',
          verifiedAt: Math.floor(Date.now() / 1000) - ageSeconds,
        },
      },
      { secret: env.TUTURUUU_APP_COORDINATION_SECRET }
    );
    const request = new Request(
      `${env.NEXT_PUBLIC_APP_URL}/_serverFn/operation`,
      {
        method: 'POST',
        headers: {
          cookie: `tuturuuu_app_session=${token.token}`,
          origin,
          referer: `${env.NEXT_PUBLIC_APP_URL}/vi/${f.scope.wsId}`,
        },
      }
    );
    const database = {
      ...createPasswordsDatabase(env, request),
      repository: f.deps.repository,
      storage: f.deps.storage,
      enabled: f.deps.enabled,
      resolveWorkspace: vi.fn(async (wsId: string) => {
        await f.deps.authorize(wsId, false);
        return { wsId, actor, name: 'Workspace' };
      }),
      workspaceMembers: vi.fn(async () => []),
    };
    return { port: createPasswordsService(request, env, database), database };
  }

  it('retains an unknown write after the stop fence closes following SQL commit', async () => {
    const execute = f.deps.repository.execute.bind(f.deps.repository);
    vi.spyOn(f.deps.repository, 'execute').mockImplementation(
      async (...args) => {
        const value = await execute(...args);
        if (args[2] === 'item.write') f.setEnabled(false);
        return value;
      }
    );
    const { port } = service();
    expect(await port.putItem(input())).toEqual({
      ok: false,
      code: 'OPERATION_UNCERTAIN',
    });
    expect(f.items.size).toBe(1);
  });

  it('round-trips a file via the real port and omits unavailable summary metadata', async () => {
    const { port } = service();
    const result = await port.putItem(input());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected fixture put');
    const revealed = await port.revealItem({
      ...f.scope,
      itemId: result.value.itemId,
      requestId: randomUUID(),
    });
    expect(revealed).toEqual({
      ok: true,
      value: {
        base64: Buffer.from('synthetic-value').toString('base64'),
        byteLength: 15,
      },
    });
    const state = await port.state(f.scope);
    expect(state.ok).toBe(true);
    if (!state.ok) throw new Error('Expected fixture state');
    expect(state.value.vault?.items[0]).not.toHaveProperty('byteLength');
    expect(state.value.vault?.items[0]).not.toHaveProperty('updatedBy');
    expect(state.value.vault?.summary.itemCount).toBe(1);
  });

  it('uses verifiedAt rather than a freshly issued token iat', async () => {
    const { port, database } = service(301);
    const result = await port.revealItem({
      ...f.scope,
      itemId: randomUUID(),
      requestId: randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected step-up rejection');
    expect(result.code).toBe('STEP_UP_REQUIRED');
    expect(result.stepUpUrl).toBe(
      `${env.NEXT_PUBLIC_APP_URL}/api/auth/step-up?next=%2Fvi%2F${f.scope.wsId}`
    );
    expect(database.resolveWorkspace).not.toHaveBeenCalled();
    expect(f.calls).toEqual([]);
  });

  it('does not serialize injected audit error details', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'info'),
    ];
    const { port } = service();
    f.setAuditFailure(true);
    const result = await port.putItem(input());
    expect(result).toEqual({ ok: false, code: 'OPERATION_UNCERTAIN' });
    expect(JSON.stringify(result)).not.toContain('synthetic');
    expect(f.files.size).toBe(0);
    for (const logger of logs) expect(logger).not.toHaveBeenCalled();
  });

  it('projects operation status and blocks observation behind the stop fence', async () => {
    const { port, database } = service();
    const operation = input();
    await port.putItem(operation);
    expect(
      await port.observeOperation({
        ...f.scope,
        targetRequestId: operation.requestId,
      })
    ).toEqual({
      ok: true,
      value: {
        found: true,
        action: 'item.write',
        receipt: {
          vaultId: f.scope.vaultId,
          revision: 2,
          itemId: operation.requestId,
        },
      },
    });
    database.resolveWorkspace.mockClear();
    f.setEnabled(false);
    expect(
      await port.observeOperation({
        ...f.scope,
        targetRequestId: operation.requestId,
      })
    ).toEqual({ ok: false, code: 'STOPPED' });
    expect(database.resolveWorkspace).not.toHaveBeenCalled();
  });

  it('rejects cross-origin mutation and stops before workspace proof', async () => {
    const { port, database } = service(30, 'https://attacker.example.test');
    expect(await port.putItem(input())).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(database.resolveWorkspace).not.toHaveBeenCalled();
    f.setEnabled(false);
    expect(await port.state(f.scope)).toEqual({ ok: false, code: 'STOPPED' });
    expect(database.resolveWorkspace).not.toHaveBeenCalled();
    expect(f.calls).toEqual([]);
  });

  it('never carries a foreign destination, token query or fragment into step-up', () => {
    const url = passwordsStepUpUrl(
      new Request(`${env.NEXT_PUBLIC_APP_URL}/en?token=private#value`, {
        headers: { referer: 'https://attacker.example.test/vi' },
      }),
      env
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe(env.NEXT_PUBLIC_APP_URL);
    expect(parsed.pathname).toBe('/api/auth/step-up');
    expect(parsed.searchParams.get('next')).toBe('/vi');
    expect(url).not.toContain('private');
    expect(url).not.toContain('attacker');
  });
});
