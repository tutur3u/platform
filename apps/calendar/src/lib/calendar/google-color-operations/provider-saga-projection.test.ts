import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderSagaCompletion } from './provider-saga-executor';
import { createProviderSagaProjection } from './provider-saga-projection';

const mocks = vi.hoisted(() => ({
  format: vi.fn(),
  encrypt: vi.fn(),
  key: vi.fn(),
}));
vi.mock('@tuturuuu/trigger/google-calendar-sync', () => ({
  formatEventForDb: mocks.format,
}));
vi.mock('../../workspace-encryption', () => ({
  encryptEventForStorage: mocks.encrypt,
  getWorkspaceKey: mocks.key,
}));
const scope = {
  wsId: '00000000-0000-4000-8000-000000008711',
  eventId: '00000000-0000-4000-8000-000000008741',
};
const endpoint = {
  provider: 'google' as const,
  workspaceCalendarId: null,
  identity: {
    ...scope,
    connectionId: '00000000-0000-4000-8000-000000008731',
    authTokenId: '00000000-0000-4000-8000-000000008721',
    calendarId: 'synthetic-calendar',
    providerEventId: 'synthetic-target',
  },
};
const completion: ProviderSagaCompletion = {
  binding: {
    operationId: '00000000-0000-4000-8000-000000008751',
    generation: '1',
    action: 'create',
    mode: 'insert',
    source: null,
    destination: endpoint,
    baseETag: null,
  },
  endpoint,
  outcome: 'applied',
  localPatch: { locked: true },
  sealedEvent: { summary: 'Unconfirmed intended title' },
  observation: {
    absent: false,
    eventId: 'synthetic-target',
    etag: 'latest',
    marker: '00000000-0000-4000-8000-000000008751',
    event: {
      id: 'synthetic-target',
      etag: 'latest',
      summary: 'Authoritative title',
      start: { dateTime: '2026-10-02T10:00:00Z' },
      end: { dateTime: '2026-10-02T11:00:00Z' },
      extendedProperties: {
        private: {
          tuturuuuSagaOperation: '00000000-0000-4000-8000-000000008751',
        },
      },
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.key.mockResolvedValue(Buffer.alloc(32, 8));
  mocks.encrypt.mockResolvedValue({
    title: 'ciphertext-title',
    description: 'ciphertext-description',
    is_encrypted: true,
  });
  mocks.format.mockReturnValue({
    title: 'Authoritative title',
    description: '',
    location: null,
    start_at: '2026-10-02T10:00:00Z',
    end_at: '2026-10-02T11:00:00Z',
    color: 'RED',
    scheduling_metadata: { google_color: { color_id: '11' } },
  });
});
function factory() {
  const assertAllowed = vi.fn().mockResolvedValue(undefined);
  return {
    assertAllowed,
    project: createProviderSagaProjection({
      access: { assertAllowed } as never,
    }),
  };
}
describe('encrypted authoritative saga projection', () => {
  it('formats final observation and encrypts public fields rather than projecting intended request title', async () => {
    const f = factory();
    const projected = await f.project(completion);
    expect(mocks.format.mock.calls[0]?.[0]).toBe(
      completion.observation && !completion.observation.absent
        ? completion.observation.event
        : null
    );
    expect(mocks.encrypt).toHaveBeenCalledWith(
      scope.wsId,
      expect.objectContaining({ title: 'Authoritative title' }),
      expect.any(Buffer)
    );
    expect(projected.projection).toEqual({
      title: 'ciphertext-title',
      description: 'ciphertext-description',
      is_encrypted: true,
      locked: true,
    });
    expect(f.assertAllowed).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(projected)).not.toContain(
      'Unconfirmed intended title'
    );
  });
  it('fails closed when current encryption key is unavailable', async () => {
    mocks.key.mockResolvedValueOnce(null);
    await expect(factory().project(completion)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it('rejects changed authoritative event identity and unverified Microsoft projection', async () => {
    await expect(
      factory().project({
        ...completion,
        observation: {
          ...completion.observation!,
          absent: false,
          eventId: 'other-event',
          etag: 'latest',
          marker: null,
          event: { id: 'synthetic-target' },
        },
      })
    ).rejects.toMatchObject({ reason: 'identity' });
    await expect(
      factory().project({
        ...completion,
        endpoint: { ...endpoint, provider: 'microsoft' },
      })
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
  it('native transfer encrypts only the immutable sealed native snapshot after confirmed source deletion', async () => {
    const native = {
      ...scope,
      provider: 'tuturuuu' as const,
      workspaceCalendarId: null,
    };
    const nativeCompletion: ProviderSagaCompletion = {
      ...completion,
      endpoint: native,
      observation: null,
      binding: {
        ...completion.binding,
        action: 'move',
        mode: 'external-to-native',
        source: endpoint,
        destination: native,
        baseETag: 'original',
      },
      sealedEvent: {
        title: 'Sealed native snapshot',
        description: '',
        location: null,
        start_at: '2026-10-02T10:00:00Z',
        end_at: '2026-10-02T11:00:00Z',
      },
    };
    await factory().project(nativeCompletion);
    expect(mocks.format).not.toHaveBeenCalled();
    expect(mocks.encrypt).toHaveBeenCalledWith(
      scope.wsId,
      expect.objectContaining({ title: 'Sealed native snapshot' }),
      expect.any(Buffer)
    );
    await expect(
      factory().project({ ...nativeCompletion, outcome: 'superseded' })
    ).rejects.toMatchObject({ reason: 'identity' });
  });
});
