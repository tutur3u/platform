// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordsDatabase } from './database.server';
import type { PasswordsEnvironment } from './environment';

describe('Passwords request-bound Supabase adapter', () => {
  const actor = randomUUID();
  const workspace = randomUUID();
  const env: PasswordsEnvironment = {
    ASSETS: { fetch: async () => new Response() },
    PASSWORDS_ENABLED: 'true',
    NEXT_PUBLIC_APP_URL: 'https://passwords.example.test',
    NEXT_PUBLIC_WEB_APP_URL: 'https://web.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-service-key',
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-secret',
    ENCRYPTION_MASTER_KEY: 'synthetic-master',
  };
  let banned = false;
  let archived = false;
  let membershipError = false;
  let auditError = false;
  const stored = new Uint8Array([1, 2, 3]);
  const objectId = randomUUID();
  const transport = vi.fn<typeof fetch>();

  function request(
    targetApp = 'passwords',
    secret = env.TUTURUUU_APP_COORDINATION_SECRET
  ) {
    const signed = createAppSessionToken(
      { targetApp, userId: actor },
      { secret }
    );
    return new Request(`${env.NEXT_PUBLIC_APP_URL}/en/${workspace}`, {
      headers: { authorization: `Bearer ${signed.token}` },
    });
  }

  beforeEach(() => {
    banned = false;
    archived = false;
    membershipError = false;
    auditError = false;
    transport.mockReset();
    transport.mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL
          ? input.toString()
          : input.url
      );
      if (url.pathname === '/rest/v1/workspaces') {
        if (membershipError)
          return Response.json(
            { code: 'XX000', message: 'synthetic private database error' },
            { status: 500 }
          );
        return Response.json({
          id: workspace,
          name: 'Workspace',
          deleted: false,
          workspace_members: [{ user_id: actor, type: 'MEMBER' }],
        });
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/'))
        return Response.json({
          id: actor,
          banned_until: banned ? '2999-01-01T00:00:00Z' : null,
        });
      if (url.pathname === '/rest/v1/workspace_user_linked_users')
        return Response.json(
          archived
            ? [
                {
                  virtual_user_id: randomUUID(),
                  workspace_users: { archived: true },
                },
              ]
            : []
        );
      if (url.pathname === '/rest/v1/rpc/password_vault_execute') {
        if (auditError)
          return Response.json(
            { code: 'P0001', message: 'synthetic private audit failure' },
            { status: 500 }
          );
        return Response.json({
          vault_id: JSON.parse(String(init?.body)).p_vault,
          revision: 1,
          replayed: false,
        });
      }
      if (url.pathname === '/rest/v1/rpc/password_vault_list')
        return Response.json({ vaults: [], replayed: false });
      if (url.pathname.startsWith('/storage/v1/object/')) {
        if (init?.method === 'POST')
          return Response.json({
            Id: objectId,
            Key: url.pathname.slice('/storage/v1/object/'.length),
          });
        return new Response(stored.slice(), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      throw new Error('Unexpected synthetic transport path');
    });
    vi.stubGlobal('fetch', transport);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['wrong-app', 'wrong-secret', 'missing-secret', 'stopped'])(
    'makes no network call for %s',
    async (variant) => {
      const configured = {
        ...env,
        ...(variant === 'missing-secret'
          ? { TUTURUUU_APP_COORDINATION_SECRET: '' }
          : {}),
        ...(variant === 'stopped' ? { PASSWORDS_ENABLED: 'false' } : {}),
      };
      const req = request(
        variant === 'wrong-app' ? 'web' : 'passwords',
        variant === 'wrong-secret'
          ? 'wrong-secret'
          : env.TUTURUUU_APP_COORDINATION_SECRET
      );
      await expect(
        createPasswordsDatabase(configured, req).repository.list(workspace)
      ).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    }
  );

  it('derives actor from the signature and sends only audited private RPCs', async () => {
    const database = createPasswordsDatabase(env, request());
    await database.repository.execute(
      { wsId: workspace, vaultId: randomUUID() },
      randomUUID(),
      'item.list',
      { limit: 17 }
    );
    const rpc = transport.mock.calls.find(([url]) =>
      String(url).includes('/rpc/')
    );
    expect(rpc).toBeDefined();
    const headers = new Headers(rpc?.[1]?.headers);
    expect(headers.get('Content-Profile')).toBe('private');
    const body = JSON.parse(String(rpc?.[1]?.body));
    expect(body.p_actor).toBe(actor);
    expect(body.p_ws).toBe(workspace);
    expect(body.p_action).toBe('item.list');
    expect(
      transport.mock.calls.some(([url]) =>
        String(url).includes('/rest/v1/password_vault')
      )
    ).toBe(false);
    const membership = transport.mock.calls.find(([url]) =>
      String(url).includes('/rest/v1/workspaces')
    );
    expect(String(membership?.[0])).toContain(
      `workspace_members.user_id=eq.${actor}`
    );
  });

  it.each(['banned', 'archived', 'membership-error'])(
    'denies %s before privileged RPC or storage',
    async (variant) => {
      banned = variant === 'banned';
      archived = variant === 'archived';
      membershipError = variant === 'membership-error';
      const database = createPasswordsDatabase(env, request());
      await expect(database.repository.list(workspace)).rejects.toThrow(
        variant === 'membership-error' ? 'UNAVAILABLE' : 'FORBIDDEN'
      );
      expect(
        transport.mock.calls.some(
          ([url]) =>
            String(url).includes('/rpc/') || String(url).includes('/storage/')
        )
      ).toBe(false);
    }
  );

  it('maps audit errors without exposing their text or a success response', async () => {
    auditError = true;
    const database = createPasswordsDatabase(env, request());
    await expect(
      database.repository.execute(
        { wsId: workspace, vaultId: randomUUID() },
        randomUUID(),
        'item.read',
        { item_id: randomUUID() }
      )
    ).rejects.toThrow('OPERATION_UNCERTAIN');
  });

  it('uploads an immutable exact path, returns the actual object UUID and downloads bytes', async () => {
    const database = createPasswordsDatabase(env, request());
    const path = `${workspace}/${randomUUID()}/1/${randomUUID()}/${randomUUID()}`;
    expect(await database.storage.upload(path, stored)).toEqual({
      id: objectId,
    });
    expect(await database.storage.download(path)).toEqual(stored);
    const call = transport.mock.calls.find(
      ([url, options]) =>
        String(url).includes('/storage/') && options?.method === 'POST'
    );
    expect(String(call?.[0])).toBe(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/password-vault-files/${path}`
    );
    expect(new Headers(call?.[1]?.headers).get('x-upsert')).toBe('false');
    expect(new Headers(call?.[1]?.headers).get('content-type')).toBe(
      'application/octet-stream'
    );
    expect(
      transport.mock.calls.filter(
        ([url, options]) =>
          String(url).includes('/storage/') && options?.method === 'POST'
      )
    ).toHaveLength(1);
  });
});
