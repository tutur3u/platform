// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111',
  revoke: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => unknown) =>
    (request: Request) =>
      handler(request, { user: { id: mocks.userId } }),
}));
vi.mock('./oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./oauth')>()),
  revokeRegistration: mocks.revoke,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

import { DELETE, GET } from '@/app/api/v1/users/chatgpt/route';
import { withChatGPTStore } from './storage';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'chatgpt-route-test-'));
  mocks.userId = '11111111-1111-4111-8111-111111111111';
  mocks.revoke.mockResolvedValue(false);
  vi.stubEnv('CHATGPT_SUBSCRIPTIONS_DIR', directory);
  vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'self-hosted');
  vi.stubEnv('OPENAI_CHATGPT_ENABLED', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        models: [
          {
            slug: 'synthetic-model',
            display_name: 'Synthetic',
            visibility: 'list',
          },
        ],
      })
    )
  );
  await withChatGPTStore(mocks.userId, async (store) => {
    store.registrations.push({
      clientId: 'oaiapp_test',
      subject: 'synthetic-subject',
      email: 'synthetic@example.com',
      accessToken: 'synthetic-access',
      refreshToken: 'synthetic-refresh',
      idToken: 'synthetic-id-token',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['chatgpt.tokens.use.direct'],
    });
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('ChatGPT account management API', () => {
  it('returns only the authenticated owner catalog without any credentials', async () => {
    const response = await GET(
      new Request('http://localhost/api/v1/users/chatgpt') as NextRequest
    );
    const body = await response.json();
    expect(body.accounts).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('synthetic-access');
    expect(JSON.stringify(body)).not.toContain('synthetic-refresh');
    expect(JSON.stringify(body)).not.toContain('synthetic-id-token');
    mocks.userId = '22222222-2222-4222-8222-222222222222';
    const other = await GET(
      new Request('http://localhost/api/v1/users/chatgpt') as NextRequest
    );
    expect((await other.json()).accounts).toEqual([]);
  });
  it('clears local credentials and reports unconfirmed remote revocation', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/v1/users/chatgpt', {
        method: 'DELETE',
        body: JSON.stringify({ clientId: 'oaiapp_test' }),
      }) as NextRequest
    );
    expect(await response.json()).toEqual({ remoteRevoked: false });
    const saved = await withChatGPTStore(
      mocks.userId,
      async (store) => store.registrations[0]
    );
    expect(saved?.clientId).toBe('oaiapp_test');
    expect(saved?.refreshToken).toBeUndefined();
    expect(saved?.accessToken).toBeUndefined();
    expect(saved?.idToken).toBeUndefined();
  });
  it('keeps hosted deployments disabled even if the feature flag is set', async () => {
    vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'hosted');
    const response = await GET(
      new Request('http://localhost/api/v1/users/chatgpt') as NextRequest
    );
    expect(await response.json()).toEqual({ enabled: false, accounts: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
