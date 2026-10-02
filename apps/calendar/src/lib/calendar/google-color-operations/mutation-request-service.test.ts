import { describe, expect, it, vi } from 'vitest';
import { createRequestGoogleMutationService } from './mutation-request-service';

const fixtures = vi.hoisted(() => ({
  discover: vi.fn(),
  assertAllowed: vi.fn(),
  prepare: vi.fn(),
  provider: vi.fn(),
}));
vi.mock('./request-access', () => ({
  createRequestColorOperationAccess: () => ({ ...fixtures }),
}));
vi.mock('./mutation-provider', () => ({
  createGoogleMutationProvider: () => ({ prepare: fixtures.prepare }),
}));
vi.mock('../../workspace-encryption', () => ({
  getWorkspaceKey: vi.fn(),
  encryptEventForStorage: vi.fn(),
  decryptEventFromStorage: vi.fn(),
}));
vi.mock('@tuturuuu/trigger/google-calendar-sync', () => ({
  formatEventForDb: vi.fn(),
}));
const identity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: 'calendar',
  providerEventId: 'provider-event',
};
function fixture() {
  vi.clearAllMocks();
  const rpc = vi.fn(async (_name, params) => {
    if (params.p_action === 'inspect')
      return {
        data: { generation: '9007199254740993', operation: null },
        error: null,
      };
    const input = params.p_input;
    return {
      data: {
        id: input.id,
        generation: input.prepared.binding.generation,
        identity,
        prepared: input.prepared,
        phase: 'prepared',
        requestHash: input.requestHash,
        intent: { kind: 'mutation', connectionId: identity.connectionId },
      },
      error: null,
    };
  });
  fixtures.discover.mockResolvedValue({
    identity,
    sbAdmin: { rpc },
    userId: '66666666-6666-4666-8666-666666666666',
  });
  fixtures.assertAllowed.mockResolvedValue(undefined);
  fixtures.provider.mockResolvedValue({
    source: { accountEmail: 'invited@example.test' },
  });
  fixtures.prepare.mockImplementation(async (input) => ({
    binding: {
      operationId: input.operationId,
      generation: input.generation,
      identity,
      action: input.action,
      baseETag: 'immutable-version',
    },
    journal: { version: 1, ciphertext: 'encrypted-fixture' },
  }));
  return { rpc };
}
describe('request mutation admission contract', () => {
  it('blocks a known pending cross-kind operation before provider preparation or encryption', async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({
      data: {
        generation: '8',
        operation: {
          id: '11111111-1111-4111-8111-111111111111',
          phase: 'dispatched',
          identity,
          intent: { kind: 'event', connectionId: identity.connectionId },
        },
      },
      error: null,
    } as never);
    const service = await createRequestGoogleMutationService(
      new Request('https://example.test'),
      identity.wsId,
      identity.eventId
    );
    await expect(
      service.reserve({
        action: 'delete',
        providerPatch: {},
        sendUpdates: 'all',
      })
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(fixtures.prepare).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it('derives meeting-response identity from the freshly authorized account and seals notification policy', async () => {
    fixture();
    const service = await createRequestGoogleMutationService(
      new Request('https://example.test'),
      identity.wsId,
      identity.eventId
    );
    await service.reserveResponse('accepted');
    expect(fixtures.provider).toHaveBeenCalledWith(identity);
    expect(fixtures.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPatch: {},
        sendUpdates: 'all',
        meetingResponse: {
          accountEmail: 'invited@example.test',
          response: 'accepted',
        },
      })
    );
  });
  it('rejects a missing connected-account email before provider preparation', async () => {
    fixture();
    fixtures.provider.mockResolvedValueOnce({ source: { accountEmail: null } });
    const service = await createRequestGoogleMutationService(
      new Request('https://example.test'),
      identity.wsId,
      identity.eventId
    );
    await expect(service.reserveResponse('declined')).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    expect(fixtures.prepare).not.toHaveBeenCalled();
  });
  it('preserves bigint generations across JSON admission without Number precision loss', async () => {
    const f = fixture();
    const service = await createRequestGoogleMutationService(
      new Request('https://example.test'),
      identity.wsId,
      identity.eventId
    );
    const op = await service.reserve({
      action: 'patch',
      providerPatch: { summary: 'Synthetic title' },
      sendUpdates: 'all',
    });
    expect(op.generation).toBe('9007199254740994');
    expect(f.rpc.mock.calls[1]?.[1].p_input.expectedGeneration).toBe(
      '9007199254740993'
    );
    expect(fixtures.prepare).toHaveBeenLastCalledWith(
      expect.objectContaining({
        generation: '9007199254740994',
        sendUpdates: 'all',
        identity,
      })
    );
  });
  it('propagates a competing admission as conflict rather than refreshing the prepared version or retrying', async () => {
    const f = fixture();
    f.rpc
      .mockResolvedValueOnce({
        data: { generation: '9007199254740993', operation: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } } as never);
    const service = await createRequestGoogleMutationService(
      new Request('https://example.test'),
      identity.wsId,
      identity.eventId
    );
    await expect(
      service.reserve({
        action: 'delete',
        providerPatch: {},
        sendUpdates: 'all',
      })
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
});
