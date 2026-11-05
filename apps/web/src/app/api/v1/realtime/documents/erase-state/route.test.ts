// @vitest-environment node
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: rpc,
}));
const claims = {
  aud: 'tuturuuu.document-erase-callback',
  kind: 'generation',
  namespace: 'CHANNEL_ROOM',
  topic: 'meeting-document-11111111-1111-4111-8111-111111111111',
  meeting_id: '11111111-1111-4111-8111-111111111111',
  document_id: '22222222-2222-4222-8222-222222222222',
  nonce: '33333333-3333-4333-8333-333333333333',
  key_version: 1,
};
const req = (changes = {}, key = 'fixture-callback-only') =>
  new Request('https://fixture.invalid', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signRealtimePayload({ ...claims, exp: Math.floor(Date.now() / 1000) + 30, ...changes }, key)}`,
    },
  });
beforeEach(() => {
  vi.stubEnv('MEET_ERASE_CALLBACK_KEY_V1', 'fixture-callback-only');
  rpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it('binds authenticated callbacks and delegates durable nonce consumption to the service RPC', async () => {
  rpc.mockResolvedValue({ doc_generation: 0 });
  const { POST } = await import('./route');
  expect((await POST(req())).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('meet_document_erase_callback', {
    p_claims: expect.objectContaining(claims),
  });
});
it('refuses shared realtime keys, namespace/topic substitution and expired tokens before RPC', async () => {
  const { POST } = await import('./route');
  for (const request of [
    req({}, 'fixture-realtime-only'),
    req({ namespace: 'COLLABORATION_ROOM' }),
    req({ topic: 'meeting-document-other' }),
    req({ exp: 1 }),
  ])
    expect((await POST(request)).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('returns no state when nonce admission or the service is unavailable', async () => {
  rpc.mockRejectedValue(new Error('nonce conflict'));
  const { POST } = await import('./route');
  const response = await POST(req());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('');
});
it('rotates callback key versions without code changes and preserves command nonce', async () => {
  vi.stubEnv('MEET_ERASE_CALLBACK_KEY_VERSION', '7');
  rpc.mockResolvedValue({ allowed: true });
  const { POST } = await import('./route');
  expect((await POST(req())).status).toBe(401);
  const commandNonce = '44444444-4444-4444-8444-444444444444';
  expect(
    (
      await POST(
        req({ kind: 'admit', key_version: 7, command_nonce: commandNonce })
      )
    ).status
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith('meet_document_erase_callback', {
    p_claims: expect.objectContaining({
      nonce: claims.nonce,
      command_nonce: commandNonce,
      key_version: 7,
    }),
  });
});
