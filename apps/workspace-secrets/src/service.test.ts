import { describe, expect, it, vi } from 'vitest';
import { type Db, fromByteaHex } from './db';
import {
  credentialKeyStatus,
  putCredential,
  renameCredential,
  revealCredential,
} from './service';

// A throwaway KEK generated per run; never stored anywhere.
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
const env = {
  WORKSPACE_SECRETS_KEK_ACTIVE_VERSION: '1',
  WORKSPACE_SECRETS_KEK_V1: base64(crypto.getRandomValues(new Uint8Array(32))),
};

const WS = '39120000-0000-4000-8000-0000000000a1';
const OTHER_WS = '39120000-0000-4000-8000-0000000000a2';

interface Row {
  id: string;
  ws_id: string;
  name: string;
  value: string | null;
  value_rev: number;
  payload?: {
    kek_version: number;
    wrapped_dek: string;
    ciphertext: string;
    source_rev: number;
    request_id: string;
  };
}

/** Mirrors the step-1 RPC contracts closely enough to test the Worker. */
function fakeDb() {
  const rows = new Map<string, Row>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db: Db = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ args, name });
      if (name === 'put_workspace_secret_credential') {
        const id = args.p_secret_id as string;
        const existing = rows.get(id);
        if (
          existing?.payload &&
          existing.payload.request_id === args.p_request_id &&
          existing.payload.source_rev === existing.value_rev
        ) {
          return [
            {
              secret_id: id,
              status: 'replayed',
              value_rev: existing.value_rev,
            },
          ];
        }
        let rev: number;
        if (args.p_expected_rev === null) {
          if (
            existing ||
            [...rows.values()].some(
              (r) => r.ws_id === args.p_ws_id && r.name === args.p_name
            )
          ) {
            return [{ secret_id: id, status: 'conflict', value_rev: null }];
          }
          rev = 0;
          rows.set(id, {
            id,
            name: args.p_name as string,
            value: null,
            value_rev: 0,
            ws_id: args.p_ws_id as string,
          });
        } else {
          if (!existing || existing.ws_id !== args.p_ws_id) {
            return [{ secret_id: id, status: 'not_found', value_rev: null }];
          }
          if (existing.value_rev !== args.p_expected_rev) {
            return [
              {
                secret_id: id,
                status: 'conflict',
                value_rev: existing.value_rev,
              },
            ];
          }
          rev = existing.value_rev + 1;
          existing.value_rev = rev;
          existing.value = null;
          existing.name = args.p_name as string;
        }
        rows.get(id)!.payload = {
          ciphertext: args.p_ciphertext as string,
          kek_version: args.p_kek_version as number,
          request_id: args.p_request_id as string,
          source_rev: rev,
          wrapped_dek: args.p_wrapped_dek as string,
        };
        return [{ secret_id: id, status: 'ok', value_rev: rev }];
      }
      if (name === 'get_workspace_secret_credential') {
        const row = [...rows.values()].find(
          (r) => r.ws_id === args.p_ws_id && r.name === args.p_name
        );
        if (!row) return [];
        const payload =
          row.payload?.source_rev === row.value_rev ? row.payload : undefined;
        return [
          {
            ciphertext: payload?.ciphertext ?? null,
            kek_version: payload?.kek_version ?? null,
            legacy_value: payload ? null : row.value,
            name: row.name,
            secret_id: row.id,
            value_rev: String(row.value_rev),
            wrapped_dek: payload?.wrapped_dek ?? null,
          },
        ];
      }
      if (name === 'workspace_secret_credential_status') {
        const row = rows.get(args.p_secret_id as string);
        if (!row || row.ws_id !== args.p_ws_id) return 'missing';
        return row.payload || row.value ? 'active' : 'invalid';
      }
      throw new Error(`unexpected rpc ${name}`);
    }) as Db['rpc'],
  };
  return { calls, db, rows };
}

let nextId = 0;
const uuid = () =>
  `39120000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;

describe('put and reveal', () => {
  it('encrypts before the database sees the value and reveals it back', async () => {
    const { calls, db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const put = await putCredential(deps, 'web', {
      name: 'DRIVE_R2_SECRET_ACCESS_KEY',
      requestId: uuid(),
      value: 'synthetic-credential-0001',
      wsId: WS,
    });
    expect(put).toMatchObject({ last4: '0001', status: 'ok', valueRev: 0 });
    expect(JSON.stringify(calls)).not.toContain('synthetic-credential-0001');
    const payload = calls[0]!.args;
    expect(fromByteaHex(payload.p_ciphertext).length).toBeGreaterThan(0);

    await expect(
      revealCredential(deps, 'web', {
        name: 'DRIVE_R2_SECRET_ACCESS_KEY',
        purpose: 'storage',
        wsId: WS,
      })
    ).resolves.toEqual({
      status: 'ok',
      value: 'synthetic-credential-0001',
      valueRev: 0,
    });
  });

  it('replaces with compare-and-swap on value_rev and reports conflicts', async () => {
    const { db, rows } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const created = await putCredential(deps, 'admin', {
      name: 'X_TOKEN',
      requestId: uuid(),
      value: 'first-synthetic',
      wsId: WS,
    });
    if (created.status !== 'ok') throw new Error('create failed');

    const replaced = await putCredential(deps, 'admin', {
      expectedValueRev: 0,
      name: 'X_TOKEN',
      requestId: uuid(),
      secretId: created.secretId,
      value: 'second-synthetic',
      wsId: WS,
    });
    expect(replaced).toMatchObject({ status: 'ok', valueRev: 1 });

    const stale = await putCredential(deps, 'admin', {
      expectedValueRev: 0,
      name: 'X_TOKEN',
      requestId: uuid(),
      secretId: created.secretId,
      value: 'stale-synthetic',
      wsId: WS,
    });
    expect(stale).toEqual({ currentValueRev: 1, status: 'conflict' });
    expect(rows.get(created.secretId)?.value_rev).toBe(1);
    await expect(
      revealCredential(deps, 'admin', {
        name: 'X_TOKEN',
        purpose: 'storage',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'forbidden' });
  });

  it('replays a retried put with the same request id', async () => {
    const { db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const requestId = uuid();
    const first = await putCredential(deps, 'web', {
      name: 'DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
      requestId,
      value: 'synthetic-token-value',
      wsId: WS,
    });
    if (first.status !== 'ok') throw new Error('create failed');
    const retry = await putCredential(deps, 'web', {
      expectedValueRev: 0,
      name: 'DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
      requestId,
      secretId: first.secretId,
      value: 'synthetic-token-value',
      wsId: WS,
    });
    expect(retry).toMatchObject({ status: 'ok', valueRev: 0 });
  });

  it('refuses config names, other callers and malformed input before encrypting', async () => {
    const { db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    await expect(
      putCredential(deps, 'web', {
        name: 'ENABLE_CHAT',
        requestId: uuid(),
        value: 'true',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'not_credential' });
    await expect(
      putCredential(deps, 'storage', {
        name: 'X_TOKEN',
        requestId: uuid(),
        value: 'v',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'forbidden' });
    await expect(
      putCredential(deps, 'web', {
        name: 'X_TOKEN',
        requestId: 'not-a-uuid',
        value: 'v',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'invalid' });
    await expect(
      putCredential(deps, 'web', {
        expectedValueRev: 0,
        name: 'X_TOKEN',
        requestId: uuid(),
        value: 'v',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'invalid' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('applies the per-caller reveal allowlist and purposes', async () => {
    const { db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    await putCredential(deps, 'admin', {
      name: 'mobile_calendar_gateway:v1',
      requestId: uuid(),
      value: 'synthetic-envelope-json',
      wsId: WS,
    });
    const reveal = (
      caller: 'admin' | 'web' | 'storage',
      purpose: 'mobile-calendar' | 'storage'
    ) =>
      revealCredential(deps, caller, {
        name: 'mobile_calendar_gateway:v1',
        purpose,
        wsId: WS,
      });
    await expect(reveal('admin', 'mobile-calendar')).resolves.toMatchObject({
      status: 'ok',
    });
    await expect(reveal('admin', 'storage')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(reveal('web', 'mobile-calendar')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(reveal('storage', 'storage')).resolves.toEqual({
      status: 'forbidden',
    });
  });

  it('reveals legacy plaintext rows that are not encrypted yet', async () => {
    const { db, rows } = fakeDb();
    rows.set('39120000-0000-4000-8000-0000000000f1', {
      id: '39120000-0000-4000-8000-0000000000f1',
      name: 'DRIVE_R2_ACCESS_KEY_ID',
      value: 'legacy-synthetic',
      value_rev: 3,
      ws_id: WS,
    });
    await expect(
      revealCredential({ db, env }, 'storage', {
        name: 'DRIVE_R2_ACCESS_KEY_ID',
        purpose: 'storage',
        wsId: WS,
      })
    ).resolves.toEqual({
      status: 'ok',
      value: 'legacy-synthetic',
      valueRev: 3,
    });
    await expect(
      revealCredential({ db, env }, 'storage', {
        name: 'DRIVE_R2_ACCESS_KEY_ID',
        purpose: 'storage',
        wsId: OTHER_WS,
      })
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('fails closed when a payload was moved to another row', async () => {
    const { db, rows } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const botToken = 'AI_AGENT_REGISTRY:a:channel:c:secret:botToken';
    const webhook = 'AI_AGENT_REGISTRY:a:channel:c:secret:webhookSecret';
    const a = await putCredential(deps, 'web', {
      name: botToken,
      requestId: uuid(),
      value: 'synthetic-a-value',
      wsId: WS,
    });
    const b = await putCredential(deps, 'web', {
      name: webhook,
      requestId: uuid(),
      value: 'synthetic-b-value',
      wsId: WS,
    });
    if (a.status !== 'ok' || b.status !== 'ok')
      throw new Error('create failed');
    rows.get(b.secretId)!.payload = { ...rows.get(a.secretId)!.payload! };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      revealCredential(deps, 'web', {
        name: webhook,
        purpose: 'ai-agents',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'unavailable' });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(
      'synthetic-a-value'
    );
    await expect(
      revealCredential(deps, 'web', {
        name: botToken,
        purpose: 'ai-agents',
        wsId: WS,
      })
    ).resolves.toMatchObject({ status: 'ok', value: 'synthetic-a-value' });
  });

  it('fails closed without a KEK, naming no key material', async () => {
    const { db } = fakeDb();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await putCredential(
      { db, env: {}, randomUUID: uuid },
      'web',
      {
        name: 'X_TOKEN',
        requestId: uuid(),
        value: 'synthetic-value',
        wsId: WS,
      }
    );
    expect(result).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(errors.mock.calls)).not.toContain('synthetic-value');
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe('rename', () => {
  it('re-seals for the new name so the value still decrypts', async () => {
    const { db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const created = await putCredential(deps, 'web', {
      name: 'OLD_TOKEN',
      requestId: uuid(),
      value: 'synthetic-rename-value',
      wsId: WS,
    });
    if (created.status !== 'ok') throw new Error('create failed');
    const renamed = await renameCredential(deps, 'web', {
      expectedValueRev: 0,
      fromName: 'OLD_TOKEN',
      requestId: uuid(),
      secretId: created.secretId,
      toName: 'NEW_TOKEN',
      wsId: WS,
    });
    expect(renamed).toMatchObject({ status: 'ok', valueRev: 1 });
    await expect(
      renameCredential(deps, 'web', {
        expectedValueRev: 0,
        fromName: 'NEW_TOKEN',
        requestId: uuid(),
        secretId: created.secretId,
        toName: 'NEWER_TOKEN',
        wsId: WS,
      })
    ).resolves.toEqual({ currentValueRev: 1, status: 'conflict' });
    await expect(
      renameCredential(deps, 'web', {
        expectedValueRev: 1,
        fromName: 'NEW_TOKEN',
        requestId: uuid(),
        secretId: created.secretId,
        toName: 'ENABLE_LEAK',
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'not_credential' });
  });
});

describe('key status', () => {
  it('returns metadata only and only to allowed callers', async () => {
    const { calls, db } = fakeDb();
    const deps = { db, env, randomUUID: uuid };
    const created = await putCredential(deps, 'web', {
      name: 'X_TOKEN',
      requestId: uuid(),
      value: 'synthetic-status-value',
      wsId: WS,
    });
    if (created.status !== 'ok') throw new Error('create failed');
    await expect(
      credentialKeyStatus(deps, 'key-status', {
        keyId: created.secretId,
        wsId: WS,
      })
    ).resolves.toEqual({ keyStatus: 'active', status: 'ok' });
    await expect(
      credentialKeyStatus(deps, 'key-status', {
        keyId: created.secretId,
        wsId: OTHER_WS,
      })
    ).resolves.toEqual({ keyStatus: 'missing', status: 'ok' });
    await expect(
      credentialKeyStatus(deps, 'storage', {
        keyId: created.secretId,
        wsId: WS,
      })
    ).resolves.toEqual({ status: 'forbidden' });
    expect(calls.map((call) => call.name)).not.toContain(
      'get_workspace_secret_credential'
    );
  });
});
