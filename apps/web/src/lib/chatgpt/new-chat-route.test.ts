// @vitest-environment node
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => unknown) =>
    (request: Request) =>
      handler(request, {
        user: { id: '11111111-1111-4111-8111-111111111111' },
        supabase: { from: () => ({ insert: mocks.insert }) },
      }),
}));
vi.mock('./provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./provider')>()),
  getChatGPTAccess: mocks.access,
}));

import { POST } from '@/app/api/ai/chatgpt/new/route';
import { ChatGPTError } from './errors';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'self-hosted');
  vi.stubEnv('OPENAI_CHATGPT_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());

function request(message: string, model = 'chatgpt/oaiapp_test/model') {
  return new Request('http://localhost/api/ai/chatgpt/new', {
    method: 'POST',
    body: JSON.stringify({
      id: '22222222-2222-4222-8222-222222222222',
      message,
      model,
    }),
  }) as NextRequest;
}

describe('subscription chat creation failures', () => {
  it('rejects PostgreSQL-incompatible NUL before credential or database access', async () => {
    expect((await POST(request('hello\0world'))).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('rejects malformed model identifiers before credential access', async () => {
    expect((await POST(request('hello', 'wrong-model'))).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it.each([
    [new Error('synthetic filesystem failure'), 503],
    [new ChatGPTError('Reconnect', 403, 'CHATGPT_CONNECTION_REQUIRED'), 403],
  ])(
    'separates operational errors from missing credentials',
    async (error, status) => {
      mocks.access.mockRejectedValue(error);
      const response = await POST(request('hello'));
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain(
        'synthetic filesystem failure'
      );
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );
});
