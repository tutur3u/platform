import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createPOST, type MindRouteCallbacks } from './route';

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/mind', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

function createAuthRejectedCallbacks(): MindRouteCallbacks {
  return {
    applyPatch: async () => null,
    createPatch: async () => null,
    ensureThread: async () => '00000000-0000-4000-8000-000000000001',
    getSnapshot: async () => null,
    listBoards: async () => [],
    persistMessage: async () => {},
    resolveAccess: async () => ({
      ok: false,
      response: new Response('access failed', { status: 403 }),
    }),
    resolveAuth: async () => ({
      ok: false,
      response: new Response('auth failed', { status: 401 }),
    }),
    searchNodes: async () => [],
  };
}

describe('mind route payload validation', () => {
  it('accepts legacy null board ids before resolving auth', async () => {
    const route = createPOST(createAuthRejectedCallbacks());

    const response = await route(
      createRequest({
        boardId: null,
        messages: [],
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('auth failed');
  });

  it('rejects malformed board ids', async () => {
    const route = createPOST(createAuthRejectedCallbacks());

    const response = await route(
      createRequest({
        boardId: 'not-a-board-id',
        messages: [],
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid Mind AI payload',
    });
  });
});
