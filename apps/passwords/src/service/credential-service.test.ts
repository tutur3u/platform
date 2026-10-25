// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { describe, expect, it, vi } from 'vitest';
import { createPasswordsDatabase } from './database.server';
import type { PasswordsEnvironment } from './environment';
import { createPasswordsService } from './vault-service.server';

const handle = vi.hoisted(() => vi.fn());
vi.mock('./secrets-adapter.server', () => ({
  createSecretsHandler: () => ({ handle }),
}));

function fixture() {
  const env: PasswordsEnvironment = {
    ASSETS: { fetch: async () => new Response() },
    PASSWORDS_ENABLED: 'true',
    NEXT_PUBLIC_APP_URL: 'https://passwords.example.test',
    NEXT_PUBLIC_WEB_APP_URL: 'https://web.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-service',
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination',
    ENCRYPTION_MASTER_KEY: 'synthetic-master',
  };
  const actor = randomUUID();
  const wsId = randomUUID();
  const token = createAppSessionToken({ targetApp: 'passwords', userId: actor,
    mfa: { sessionId: 'synthetic', verifiedAt: Math.floor(Date.now() / 1000) },
  }, { secret: env.TUTURUUU_APP_COORDINATION_SECRET });
  const request = new Request(`${env.NEXT_PUBLIC_APP_URL}/_passwords/functions/credential`, {
    method: 'POST', headers: { origin: env.NEXT_PUBLIC_APP_URL,
      cookie: `tuturuuu_app_session=${token.token}` },
  });
  let enabled = true;
  const database = { ...createPasswordsDatabase(env, request),
    enabled: () => enabled,
    resolveWorkspace: async () => ({ wsId, actor, name: 'Workspace' }),
  };
  return { port: createPasswordsService(request, env, database),
    stop: () => { enabled = false; },
    input: { kind: 'agent' as const, wsId, vaultId: randomUUID(),
      grantRequestId: randomUUID(), tokenRequestId: randomUUID(),
      itemIds: [randomUUID()], scopes: ['item.read'] as ['item.read'] },
  };
}

describe('credential service outcome fences', () => {
  it('preserves UNKNOWN if the stop closes after issuance acknowledges commit', async () => {
    const f = fixture();
    handle.mockImplementationOnce(async () => {
      f.stop();
      return Response.json({ version: 1 });
    });
    expect(await f.port.downloadCredentials(f.input)).toEqual({ ok: false, code: 'OPERATION_UNCERTAIN' });
  });
  it.each([
    () => new Response('{', { status: 200 }),
    () => Response.json({ code: 'unavailable' }, { status: 503 }),
  ])('keeps malformed or server-error issuance responses UNKNOWN', async (response) => {
    const f = fixture();
    handle.mockResolvedValueOnce(response());
    expect(await f.port.downloadCredentials(f.input)).toEqual({ ok: false, code: 'OPERATION_UNCERTAIN' });
  });
});
