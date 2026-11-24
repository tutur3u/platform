import { describe, expect, it, vi } from 'vitest';
import { createDb, DB_MAX_ATTEMPTS, fromByteaHex, toByteaHex } from './db';
import { activeKekVersion, loadKek } from './kek';
import { CALLER_POLICIES, canPut, canReadKeyStatus, canReveal } from './policy';

const dbEnv = {
  SUPABASE_SECRET_KEY: 'synthetic-service-key',
  SUPABASE_URL: 'https://db.example.test',
};

describe('database client', () => {
  it('round-trips bytea hex', () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(toByteaHex(bytes)).toBe('\\x0001feff');
    expect(fromByteaHex('\\x0001feff')).toEqual(bytes);
    expect(() => fromByteaHex('0001')).toThrow();
  });

  it('retries a 5xx at most twice, then fails without the body', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('secret-bearing body', { status: 503 })
    );
    const db = createDb(dbEnv, fetchImpl, async () => {});
    const error = await db
      .rpc('get_workspace_secret_credential', {})
      .catch((e: Error) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(DB_MAX_ATTEMPTS);
    expect(String(error)).not.toContain('secret-bearing');
    expect(String(error)).toContain('db_unavailable');
  });

  it('does not retry a 4xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 409 }));
    const db = createDb(dbEnv, fetchImpl, async () => {});
    await expect(db.rpc('put_workspace_secret_credential', {})).rejects.toThrow(
      'db_rejected'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-HTTPS or missing database configuration', async () => {
    const fetchImpl = vi.fn();
    await expect(
      createDb(
        { ...dbEnv, SUPABASE_URL: 'http://db.example.test' },
        fetchImpl
      ).rpc('x', {})
    ).rejects.toThrow('db_config');
    await expect(createDb({}, fetchImpl).rpc('x', {})).rejects.toThrow(
      'db_config'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends the key only in headers, never in the URL', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json([])
    );
    await createDb(dbEnv, fetchImpl).rpc(
      'workspace_secret_credential_status',
      {}
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://db.example.test/rest/v1/rpc/workspace_secret_credential_status'
    );
    expect(url).not.toContain('synthetic-service-key');
    expect((init.headers as Record<string, string>).apikey).toBe(
      'synthetic-service-key'
    );
    expect(init.redirect).toBe('manual');
  });
});

describe('KEK loading', () => {
  const key = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
  );

  it('loads a versioned 32-byte key by name', () => {
    expect(loadKek({ WORKSPACE_SECRETS_KEK_V2: key }, 2)).toHaveLength(32);
    expect(
      activeKekVersion({ WORKSPACE_SECRETS_KEK_ACTIVE_VERSION: '2' })
    ).toBe(2);
  });

  it.each([
    [{}, 1, 'kek_missing'],
    [{ WORKSPACE_SECRETS_KEK_V1: 'c2hvcnQ=' }, 1, 'kek_wrong_length'],
    [{ WORKSPACE_SECRETS_KEK_V1: 'not base64!' }, 1, 'kek_malformed'],
    [{ WORKSPACE_SECRETS_KEK_V1: key }, 0, 'kek_version_invalid'],
  ])('refuses %j for version %s', (env, version, code) => {
    expect(() => loadKek(env, version)).toThrow(code);
  });

  it.each(['', '0', '01', '1.5', 'one'])(
    'refuses active version %j',
    (value) => {
      expect(() =>
        activeKekVersion({ WORKSPACE_SECRETS_KEK_ACTIVE_VERSION: value })
      ).toThrow('kek_active_version_invalid');
    }
  );
});

describe('caller allowlist', () => {
  it('lets only web and admin write credentials', () => {
    expect(canPut('web', 'X_TOKEN')).toBe(true);
    expect(canPut('admin', 'X_TOKEN')).toBe(true);
    expect(canPut('storage', 'X_TOKEN')).toBe(false);
    expect(canPut('key-status', 'X_TOKEN')).toBe(false);
  });

  it('never writes or renames AI provider keys, for any caller', () => {
    for (const caller of ['web', 'admin', 'storage', 'key-status'] as const) {
      expect(canPut(caller, 'AI_PROVIDER_KEY:openai')).toBe(false);
      expect(canPut(caller, ' ai_provider_key:google ')).toBe(false);
    }
  });

  it('scopes reveal by caller, purpose and name', () => {
    expect(canReveal('storage', 'DRIVE_R2_SECRET_ACCESS_KEY', 'storage')).toBe(
      true
    );
    expect(
      canReveal('storage', 'AI_AGENT_CHAT_SDK_STATE_REDIS_URL', 'ai-agents')
    ).toBe(false);
    expect(
      canReveal(
        'web',
        'AI_AGENT_REGISTRY:a:channel:c:secret:botToken',
        'ai-agents'
      )
    ).toBe(true);
    expect(
      canReveal(
        'web',
        'AI_AGENT_REGISTRY:a:channel:c:secret:botToken',
        'storage'
      )
    ).toBe(false);
    expect(
      canReveal(
        'web',
        'AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET',
        'discord-watcher'
      )
    ).toBe(false);
    expect(
      canReveal(
        'admin',
        'AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET',
        'discord-watcher'
      )
    ).toBe(true);
    expect(
      canReveal('key-status', 'DRIVE_R2_SECRET_ACCESS_KEY', 'storage')
    ).toBe(false);
  });

  it('gives key status only to the callers that need it', () => {
    expect(
      Object.keys(CALLER_POLICIES).filter((caller) =>
        canReadKeyStatus(caller as keyof typeof CALLER_POLICIES)
      )
    ).toEqual(['web', 'admin', 'key-status']);
  });
});
