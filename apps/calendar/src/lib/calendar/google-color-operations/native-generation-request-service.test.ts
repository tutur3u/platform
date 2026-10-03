import { beforeEach, expect, it, vi } from 'vitest';
import { createRequestNativeGenerationService } from './native-generation-request-service';
import { getCalendarRetainedGeneration } from './retained-generation-request-access';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock('../../calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
const wsId = '00000000-0000-4000-8000-000000008711';
const eventId = '00000000-0000-4000-8000-000000008741';
const actor = '00000000-0000-4000-8000-000000008701';
const request = new Request('https://example.test');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    wsId,
    userId: actor,
    sbAdmin: { rpc: mocks.rpc },
  });
});
it('rejects a pending retained generation before caller prepares encrypted fields', async () => {
  mocks.rpc.mockResolvedValue({
    data: { generation: '9007199254740993', pending: true },
    error: null,
  });
  await expect(
    createRequestNativeGenerationService(request, wsId, eventId).inspect()
  ).rejects.toMatchObject({ reason: 'conflict' });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('preserves bigint generation and reauthorizes the final native patch', async () => {
  const service = createRequestNativeGenerationService(request, wsId, eventId);
  mocks.rpc.mockResolvedValueOnce({
    data: { generation: '9007199254740993', pending: false },
    error: null,
  });
  const generation = await service.inspect();
  mocks.rpc.mockResolvedValueOnce({ data: { locked: true }, error: null });
  await service.patch(generation, { locked: true });
  expect(mocks.authorize).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    'calendar_native_generation_mutation',
    expect.objectContaining({
      p_input: {
        expectedGeneration: '9007199254740993',
        patch: { locked: true },
      },
    })
  );
  expect(() =>
    service.patch(generation, { title: 'Plaintext rejected' })
  ).toThrow();
});
it('retained guard works without an event row or provider selection and preserves ledgerless null', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(
    getCalendarRetainedGeneration(request, wsId, eventId)
  ).resolves.toBeNull();
  mocks.rpc.mockResolvedValueOnce({
    data: {
      generation: '4',
      pending: false,
      phase: 'applied',
      intentKind: 'saga',
      operationId: null,
    },
    error: null,
  });
  await expect(
    getCalendarRetainedGeneration(request, wsId, eventId)
  ).resolves.toMatchObject({ generation: '4', operationId: null });
  expect(mocks.rpc).toHaveBeenLastCalledWith('calendar_retained_generation', {
    p_ws_id: wsId,
    p_event_id: eventId,
    p_actor_id: actor,
  });
});
it('does not contact storage when membership/permission was revoked', async () => {
  mocks.authorize.mockResolvedValueOnce({ error: 'Revoked' });
  await expect(
    getCalendarRetainedGeneration(request, wsId, eventId)
  ).rejects.toMatchObject({ reason: 'unauthorized' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('preserves storage outages as unavailable rather than authorization denial', async () => {
  mocks.authorize.mockResolvedValueOnce({
    error: new Response(null, { status: 500 }),
  });
  await expect(
    getCalendarRetainedGeneration(request, wsId, eventId)
  ).rejects.toMatchObject({ reason: 'storage' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('uses generation zero as the CAS fence for a previously ledgerless event', async () => {
  const service = createRequestNativeGenerationService(request, wsId, eventId);
  mocks.rpc.mockResolvedValueOnce({
    data: { generation: '0', pending: false },
    error: null,
  });
  const expectedGeneration = await service.inspect();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
  await expect(
    service.patch(expectedGeneration, { locked: true })
  ).rejects.toMatchObject({ reason: 'conflict' });
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    'calendar_native_generation_mutation',
    expect.objectContaining({
      p_input: { expectedGeneration: '0', patch: { locked: true } },
    })
  );
});
