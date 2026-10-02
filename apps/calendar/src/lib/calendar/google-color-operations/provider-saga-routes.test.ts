import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { v7 } from 'uuid';
import { beforeEach, expect, it, vi } from 'vitest';
import { ColorOperationError } from './protocol';
import {
  handleProviderSagaCreate,
  handleProviderSagaMove,
} from './provider-saga-routes';

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  reserve: vi.fn(),
  execute: vi.fn(),
  read: vi.fn(),
  key: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  connection: vi.fn(),
  colorChoice: vi.fn(),
}));
vi.mock('../google-color-choices', () => ({
  resolveGoogleColorChoice: mocks.colorChoice,
}));
vi.mock('../provider-writes', () => ({
  createGoogleAuthClient: vi.fn(() => ({})),
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: vi.fn(() => ({})) },
}));
vi.mock('./provider-saga-route-service', () => ({
  createRoutedProviderSagaService: mocks.factory,
}));
vi.mock('../../workspace-encryption', () => ({
  getWorkspaceKey: mocks.key,
  encryptEventForStorage: mocks.encrypt,
  decryptEventFromStorage: mocks.decrypt,
}));
vi.mock('./route-handlers', () => ({
  operationFailure: (error: unknown, operationId?: string) =>
    Response.json(
      { ...(operationId ? { operationId } : {}) },
      {
        status:
          error instanceof ColorOperationError && error.reason === 'conflict'
            ? 409
            : 503,
      }
    ),
}));
const wsId = '00000000-0000-4000-8000-000000004411';
const eventId = '00000000-0000-4000-8000-000000004421';
const tokenId = '00000000-0000-4000-8000-000000004431';
const source = {
  provider: 'google' as const,
  connectionId: eventId,
  workspaceCalendarId: null,
  externalCalendarId: 'source',
  accessRole: 'owner',
  accountEmail: null,
  accountName: null,
  label: 'synthetic',
  color: null,
};
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: () => mocks.connection(),
};
const args = () => ({
  request: new Request('https://synthetic.invalid/events'),
  rawWsId: wsId,
  wsId,
  sbAdmin: { from: () => query } as unknown as TypedSupabaseClient,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue({
    data: { auth_token_id: tokenId },
    error: null,
  });
  mocks.colorChoice.mockResolvedValue({
    fields: { eventLabelId: 'synthetic-label' },
  });
  mocks.key.mockResolvedValue(Buffer.alloc(32, 9));
  mocks.encrypt.mockResolvedValue({
    title: 'encrypted',
    description: 'encrypted',
    is_encrypted: true,
  });
  mocks.factory.mockResolvedValue({
    reserve: mocks.reserve,
    execute: mocks.execute,
    readEvent: mocks.read,
  });
  mocks.reserve.mockImplementation(async (input) => ({
    id: input.operationId ?? eventId,
    prepared: { binding: input.binding },
  }));
  mocks.execute.mockResolvedValue({ phase: 'applied' });
  mocks.read.mockResolvedValue({ id: eventId, title: 'authoritative' });
});
it('uses the same UUIDv7 for creation admission and a lost-response retry', async () => {
  const requestId = v7();
  const event = {
    requestId,
    title: 'synthetic',
    start_at: '2026-10-02T10:00:00Z',
    end_at: '2026-10-02T11:00:00Z',
    color: 'BLUE',
  };
  mocks.execute.mockRejectedValueOnce(
    new ColorOperationError('unavailable', 'lost response')
  );
  const failed = await handleProviderSagaCreate({ ...args(), source, event });
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ operationId: requestId });
  const retried = await handleProviderSagaCreate({ ...args(), source, event });
  expect(retried.status).toBe(201);
  const admissions = mocks.reserve.mock.calls.map(([input]) => input);
  expect(admissions[0]).toEqual(admissions[1]);
  expect(admissions[0].operationId).toBe(requestId);
  expect(admissions[0].payload.eventLabelVersion).toBe(0);
  expect(admissions[0].binding.destination.identity.eventId).toBe(requestId);
  expect(admissions[0].binding.destination.identity.providerEventId).toBe(
    `tt${requestId.replaceAll('-', '')}`
  );
});
it.each(['label', 'inherit'])(
  'seals Google %s creation with label query version 1',
  async (kind) => {
    const requestId = v7();
    const response = await handleProviderSagaCreate({
      ...args(),
      source,
      event: {
        requestId,
        title: 'synthetic',
        start_at: '2026-10-02T10:00:00Z',
        end_at: '2026-10-02T11:00:00Z',
        providerColor: {
          kind,
          connectionId: source.connectionId,
          ...(kind === 'label' ? { id: 'synthetic-label' } : {}),
        },
      },
    });
    expect(response.status).toBe(201);
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ eventLabelVersion: 1 }),
      })
    );
  }
);
it('rejects missing creation ID, Microsoft and invited creation before keys or admission', async () => {
  expect(
    (await handleProviderSagaCreate({ ...args(), source, event: {} })).status
  ).toBe(400);
  expect(
    (
      await handleProviderSagaCreate({
        ...args(),
        source: { ...source, provider: 'microsoft' },
        event: { requestId: v7() },
      })
    ).status
  ).toBe(409);
  expect(
    (
      await handleProviderSagaCreate({
        ...args(),
        source,
        event: { requestId: v7(), invitation: {} },
      })
    ).status
  ).toBe(409);
  expect(mocks.factory).not.toHaveBeenCalled();
  expect(mocks.key).not.toHaveBeenCalled();
});
it('admits source-only same-account Google movement with an empty provider patch', async () => {
  const destination = {
    ...source,
    connectionId: wsId,
    externalCalendarId: 'target',
  };
  const response = await handleProviderSagaMove({
    ...args(),
    eventId,
    source,
    destination,
    existingEvent: { external_event_id: 'original' } as never,
    updates: {
      source: { provider: 'google', connectionId: wsId },
      locked: true,
    },
  });
  expect(response.status).toBe(200);
  expect(mocks.reserve).toHaveBeenCalledWith(
    expect.objectContaining({
      binding: expect.objectContaining({ mode: 'google-move', action: 'move' }),
      payload: { event: {}, localPatch: { locked: true }, sendUpdates: 'none' },
    })
  );
  expect(mocks.key).not.toHaveBeenCalled();
});
it('rejects combined move/content and cross-account moves before admission', async () => {
  const move = {
    ...args(),
    eventId,
    source,
    destination: { ...source, externalCalendarId: 'target' },
    existingEvent: { external_event_id: 'original' } as never,
  };
  expect(
    (
      await handleProviderSagaMove({
        ...move,
        updates: { source: {}, title: 'combined' },
      })
    ).status
  ).toBe(409);
  mocks.connection
    .mockResolvedValueOnce({ data: { auth_token_id: tokenId }, error: null })
    .mockResolvedValueOnce({ data: { auth_token_id: wsId }, error: null });
  expect(
    (await handleProviderSagaMove({ ...move, updates: { source: {} } })).status
  ).toBe(409);
  expect(mocks.factory).not.toHaveBeenCalled();
  expect(mocks.key).not.toHaveBeenCalled();
});

it.each([false, true])(
  'atomically admits the stored native snapshot (stale=%s)',
  async (stale) => {
    const stored = {
      id: eventId,
      ws_id: wsId,
      provider: 'tuturuuu',
      title: 'encrypted-old',
      description: 'encrypted-description',
      is_encrypted: true,
      start_at: '2026-10-02T10:00:00Z',
      end_at: '2026-10-02T11:00:00Z',
    };
    mocks.decrypt.mockResolvedValue({
      ...stored,
      title: 'private decrypted intent',
    });
    if (stale)
      mocks.reserve.mockRejectedValueOnce(
        new ColorOperationError('conflict', 'Native snapshot changed')
      );
    const response = await handleProviderSagaMove({
      ...args(),
      eventId,
      source: {
        provider: 'tuturuuu',
        workspaceCalendarId: wsId,
        label: 'Native',
        color: null,
      },
      destination: source,
      existingEvent: stored as never,
      updates: { source: {} },
    });
    expect(response.status).toBe(stale ? 409 : 200);
    const input = mocks.reserve.mock.calls[0]?.[0];
    expect(input.nativeSnapshot).toEqual(stored);
    expect(input.payload.event.summary).toBe('private decrypted intent');
    expect(input.binding).not.toHaveProperty('nativeSnapshot');
    if (stale) {
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
    } else expect(mocks.execute).toHaveBeenCalledTimes(1);
  }
);
