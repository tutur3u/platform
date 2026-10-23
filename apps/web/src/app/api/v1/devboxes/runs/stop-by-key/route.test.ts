import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock, stopByKeyMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  stopByKeyMock: vi.fn(),
}));

vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootMember: authorizeMock,
}));
vi.mock('@/lib/devboxes/store', () => ({
  stopDevboxRunByKey: stopByKeyMock,
}));

import { DevboxStoreError } from '@/lib/devboxes/store-utils';
import { POST } from './route';

const key = '7d0c3a9e-1f3b-4c55-9f1e-2a3b4c5d6e7f';
const request = (body: unknown) =>
  new Request('https://example.test/api/v1/devboxes/runs/stop-by-key', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }) as unknown as NextRequest;

describe('POST /api/v1/devboxes/runs/stop-by-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({ ok: true, user: { id: 'owner' } });
  });

  it('stops the caller run for the key', async () => {
    stopByKeyMock.mockResolvedValue({
      message: 'cancelled',
      runId: 'run-1',
      status: 'cancelled',
    });
    const response = await POST(request({ idempotencyKey: key }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runId: 'run-1' });
    expect(stopByKeyMock).toHaveBeenCalledWith({
      actorId: 'owner',
      idempotencyKey: key,
    });
  });

  it('rejects malformed keys and unauthorized callers before any lookup', async () => {
    expect((await POST(request({ idempotencyKey: 'short' }))).status).toBe(400);
    authorizeMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    });
    expect((await POST(request({ idempotencyKey: key }))).status).toBe(401);
    expect(stopByKeyMock).not.toHaveBeenCalled();
  });

  it('reports an unknown key as 404', async () => {
    stopByKeyMock.mockRejectedValue(
      new DevboxStoreError('No devbox run exists for that key.', 404)
    );
    expect((await POST(request({ idempotencyKey: key }))).status).toBe(404);
  });
});
