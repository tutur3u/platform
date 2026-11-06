// @vitest-environment node
import { createHash } from 'node:crypto';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/account-benefits-server', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/account-benefits-server')
  >()),
  accountPrivateRpc: rpc,
}));
vi.mock('@tuturuuu/realtime/documents/server', () => ({
  richTextDocumentContent: () => ({ type: 'doc', content: [] }),
}));

const secret = 'disposable-test-secret';
const meetingId = '11111111-2222-4333-8444-555555555555';
const ownerId = '22222222-3333-4444-8555-666666666666';
function request(kind = 'document-checkpoint') {
  const token = signRealtimePayload(
    {
      aud: 'tuturuuu.channels',
      kind,
      version: 3,
      topic: `meeting-document-${meetingId}`,
      userId: ownerId,
      ownerId,
      documentId: '66666666-7777-4888-8999-000000000000',
      role: 'editor',
      exp: Math.floor(Date.now() / 1000) + 30,
    },
    secret
  );
  const state = [1, 2, 3];
  return new Request(
    'https://web.invalid/api/v1/realtime/documents/checkpoint',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state,
        hash: createHash('sha256').update(Uint8Array.from(state)).digest('hex'),
      }),
    }
  );
}

describe('meeting document checkpoint route', () => {
  beforeEach(() => {
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', secret);
    rpc.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns the new revision for an accepted checkpoint', async () => {
    rpc.mockResolvedValue(3);
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 3 });
    expect(rpc).toHaveBeenCalledWith(
      'checkpoint_meeting_document',
      expect.objectContaining({ p_meeting_id: meetingId, p_version: 3 })
    );
  });

  it('surfaces a workspace conflict as 409 so the room can report it instead of retrying as deferred', async () => {
    rpc.mockRejectedValue(new AccountServiceError(409));
    const { POST } = await import('./route');
    expect((await POST(request())).status).toBe(409);
  });

  it('keeps transport faults retryable and rejects foreign ticket kinds', async () => {
    rpc.mockRejectedValue(new Error('socket hang up'));
    const { POST } = await import('./route');
    expect((await POST(request())).status).toBe(503);
    expect((await POST(request('join'))).status).toBe(401);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
