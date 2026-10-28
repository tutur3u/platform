import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

const { verifyDevboxRunnerTokenMock } = vi.hoisted(() => ({
  verifyDevboxRunnerTokenMock: vi.fn(),
}));

vi.mock('./store', () => ({
  verifyDevboxRunnerToken: verifyDevboxRunnerTokenMock,
}));

import { authorizeDevboxAgent } from './agent-auth';
import { DevboxStoreError } from './store-utils';

const request = (headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/v1/devboxes/agents/poll', {
    headers,
  });

describe('authorizeDevboxAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a verified runner token', async () => {
    verifyDevboxRunnerTokenMock.mockResolvedValue({
      heartbeatEnabled: true,
      id: 'runner-1',
    });

    const result = await authorizeDevboxAgent(
      request({ 'x-devbox-runner-token': `tdbx_${'a'.repeat(64)}` }),
      { requireOnline: true }
    );

    expect(result).toEqual({
      ok: true,
      runner: { heartbeatEnabled: true, id: 'runner-1' },
    });
    expect(verifyDevboxRunnerTokenMock).toHaveBeenCalledWith(
      `tdbx_${'a'.repeat(64)}`,
      {
        requireOnline: true,
      }
    );
  });

  it('returns 401 for missing or rejected tokens', async () => {
    const missing = await authorizeDevboxAgent(request());
    expect(missing.ok || missing.response.status).toBe(401);
    expect(verifyDevboxRunnerTokenMock).not.toHaveBeenCalled();

    verifyDevboxRunnerTokenMock.mockResolvedValue(null);
    const rejected = await authorizeDevboxAgent(
      request({ authorization: `Bearer tdbx_${'b'.repeat(64)}` })
    );
    expect(rejected.ok || rejected.response.status).toBe(401);
  });

  it.each([
    new DevboxStoreError('Devbox runner membership lookup failed.', 503),
    new DevboxStoreError('connection reset'),
    new Error('fetch failed'),
  ])(
    'returns retryable 503 instead of 401 on storage errors: %s',
    async (error) => {
      verifyDevboxRunnerTokenMock.mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await authorizeDevboxAgent(
        request({ 'x-devbox-runner-token': `tdbx_${'a'.repeat(64)}` })
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get('retry-after')).toBe('5');
    }
  );
});
