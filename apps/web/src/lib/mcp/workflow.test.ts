// @vitest-environment node

import { generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { prepareMcpConsent } from './consent';
import { createGrantReader } from './grant-store';
import {
  config,
  fixture,
  grant,
  grantId,
  other,
  session,
  task,
  user,
  workspace,
} from './workflow-fixtures';

describe('composed synthetic signed-user task read', () => {
  it('verifies JOSE JWT, provider grants/session, API membership and tenant projection in one HTTP workflow', async () => {
    const f = await fixture();
    const response = await f.handler(f.request());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.structuredContent).toEqual({
      workspace_id: workspace,
      limit: 2,
      offset: 0,
      tasks: [{ id: task, name: 'Synthetic task' }],
    });
    expect(JSON.stringify(data)).not.toMatch(
      /Private description|private@example|providerAccessToken|session_id/u
    );
    expect(f.policy).toHaveBeenCalledWith(user, session);
    for (const read of f.captured) {
      expect(read.init).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(new Headers(read.init.headers).has('authorization')).toBe(true);
    }
    expect(
      f.captured.some(
        (read) => read.url.includes('limit=2') && read.url.includes('offset=0')
      )
    ).toBe(true);
  });
  it('rejects a real wrong-signature JWT before any provider/API read', async () => {
    const f = await fixture();
    const wrong = await generateKeyPair('ES256');
    expect(
      (await f.handler(f.request(await f.sign(wrong.privateKey)))).status
    ).toBe(401);
    expect(f.captured).toHaveLength(0);
  });
  it('fails closed when the actual internal-api response belongs to another tenant', async () => {
    const f = await fixture();
    f.crossTenant();
    const data = await (await f.handler(f.request())).json();
    expect(data.result.isError).toBe(true);
    expect(JSON.stringify(data)).not.toContain('Synthetic task');
  });
  it('denies a revoked provider client before task reads', async () => {
    const f = await fixture();
    f.revokeProvider();
    expect((await f.handler(f.request())).status).toBe(401);
    expect(f.captured.some((read) => read.url.includes('/tasks?'))).toBe(false);
  });
  it('uses the owner Hidden API for discovery while preserving explicit granted reads', async () => {
    const f = await fixture();
    f.hide();
    const discovery = await (
      await f.handler(f.request(undefined, 'list_workspaces', {}))
    ).json();
    expect(discovery.result.structuredContent).toEqual({ workspaces: [] });
    expect(
      f.captured.some((read) =>
        read.url.includes(`hidden-workspaces?expectedActorId=${user}`)
      )
    ).toBe(true);
    const read = await (await f.handler(f.request())).json();
    expect(read.result.structuredContent.tasks).toEqual([
      { id: task, name: 'Synthetic task' },
    ]);
  });
});

describe('consent and persistent store binding contracts', () => {
  const actor = {
    userId: user,
    accountAllowed: true,
    mfaAllowed: true,
    csrfVerified: true,
  };
  const details = {
    authorization_id: 'synthetic-authorization',
    resource: config.resource,
    redirect_uri: 'https://client.example.invalid/callback',
    client: { id: 'approved-client' },
    user: { id: user },
    scope: 'openid',
  };
  const dependencies = {
    redirectUris: new Map([
      ['approved-client', new Set([details.redirect_uri])],
    ]),
    reads: {
      workspaces: async () => [
        { id: workspace, name: 'Member', access_type: 'member' },
      ],
    },
    visibility: async () => 'visible' as const,
  };
  const choice = { workspace_ids: [workspace], scopes: ['mcp:tasks:read'] };
  it('prepares an explicit actor/client/resource/redirect/workspace/read binding without approval or writes', async () => {
    expect(
      await prepareMcpConsent(config, choice, details, actor, dependencies)
    ).toEqual({
      authorizationId: details.authorization_id,
      userId: user,
      clientId: 'approved-client',
      resource: config.resource,
      redirectUri: details.redirect_uri,
      workspaceIds: [workspace],
      scopes: ['mcp:tasks:read'],
    });
  });
  it.each(['accountAllowed', 'mfaAllowed', 'csrfVerified'] as const)(
    'denies missing trusted %s',
    async (key) => {
      await expect(
        prepareMcpConsent(
          config,
          choice,
          details,
          { ...actor, [key]: false },
          dependencies
        )
      ).rejects.toMatchObject({ status: 403 });
    }
  );
  it('rejects actor switching, forged redirect, auto-consent and write scopes', async () => {
    for (const changed of [
      { ...details, user: { id: other } },
      { ...details, resource: 'https://other.example.invalid/mcp' },
      { ...details, resource: undefined },
      { ...details, redirect_uri: 'https://evil.example.invalid' },
      { redirect_url: details.redirect_uri },
    ]) {
      await expect(
        prepareMcpConsent(config, choice, changed, actor, dependencies)
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      prepareMcpConsent(
        config,
        { ...choice, scopes: ['mcp:tasks:write'] },
        details,
        actor,
        dependencies
      )
    ).rejects.toThrow();
  });
  it('denies unknown Hidden visibility and unaffiliated workspaces', async () => {
    await expect(
      prepareMcpConsent(config, choice, details, actor, {
        ...dependencies,
        visibility: async () => 'unknown',
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      prepareMcpConsent(
        config,
        { ...choice, workspace_ids: [other] },
        details,
        actor,
        dependencies
      )
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each([null, undefined])(
    'normalizes missing stored grant %s',
    async (missing) => {
      const reader = createGrantReader({ readCurrent: async () => missing });
      expect(await reader(user, 'approved-client', grantId)).toBeNull();
    }
  );
  it('checks stored ownership rather than trusting an adapter row', async () => {
    const reader = createGrantReader({
      readCurrent: async () => ({ ...grant, userId: other }),
    });
    await expect(
      reader(user, 'approved-client', grantId)
    ).rejects.toMatchObject({ status: 401 });
  });
});
