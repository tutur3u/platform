import { describe, expect, it, vi } from 'vitest';
import { inspectPostgresColorOperation } from './postgres-repository';

vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));
const identity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: 'calendar',
  providerEventId: 'provider-event',
};
const id = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const operation = {
    id,
    generation: '7',
    identity,
    phase: 'applied',
    intent: { kind: 'mutation', connectionId: identity.connectionId },
    requestHash: 'a'.repeat(64),
    prepared: {
      binding: {
        operationId: id,
        generation: '7',
        identity,
        action: 'patch',
        baseETag: 'original',
      },
      journal: { version: 1, ciphertext: 'encrypted-fixture' },
    },
  };
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { generation: '9', operation }, error: null });
  return {
    operation,
    rpc,
    client: { rpc } as unknown as Parameters<
      typeof inspectPostgresColorOperation
    >[0],
  };
}
describe('color admission after generic operations', () => {
  it('preserves current generation without returning a generic operation to the color executor', async () => {
    const f = fixture();
    await expect(
      inspectPostgresColorOperation(f.client, 'actor', identity)
    ).resolves.toEqual({ generation: '9', operation: null });
  });
  it('rejects a generic ledger identity from another source', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({
      data: {
        generation: '9',
        operation: {
          ...f.operation,
          identity: { ...identity, providerEventId: 'other-event' },
        },
      },
      error: null,
    });
    await expect(
      inspectPostgresColorOperation(f.client, 'actor', identity)
    ).rejects.toMatchObject({ reason: 'identity' });
  });
});
