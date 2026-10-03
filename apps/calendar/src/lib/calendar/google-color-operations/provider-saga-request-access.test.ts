import { describe, expect, it, vi } from 'vitest';
import type { SagaBinding } from './provider-saga-protocol';
import { createRequestProviderSagaAccess } from './provider-saga-request-access';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  resolveSource: vi.fn(),
}));
vi.mock('../../calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('../source-resolver', () => ({
  resolveCalendarSource: mocks.resolveSource,
}));
const binding: SagaBinding = {
  operationId: '00000000-0000-4000-8000-000000008751',
  generation: '1',
  action: 'move',
  mode: 'copy-delete',
  baseETag: 'original',
  source: {
    provider: 'google',
    workspaceCalendarId: null,
    identity: {
      wsId: '00000000-0000-4000-8000-000000008711',
      eventId: '00000000-0000-4000-8000-000000008741',
      connectionId: '00000000-0000-4000-8000-000000008731',
      authTokenId: '00000000-0000-4000-8000-000000008721',
      calendarId: 'old',
      providerEventId: 'original',
    },
  },
  destination: {
    provider: 'google',
    workspaceCalendarId: null,
    identity: {
      wsId: '00000000-0000-4000-8000-000000008711',
      eventId: '00000000-0000-4000-8000-000000008741',
      connectionId: '00000000-0000-4000-8000-000000008732',
      authTokenId: '00000000-0000-4000-8000-000000008722',
      calendarId: 'new',
      providerEventId: 'tt00000000000040008000000000008751',
    },
  },
};
function fixture(savedBinding = binding, assignedEventId?: string) {
  vi.clearAllMocks();
  let tokenActive = true;
  let moved = false;
  let absent = false;
  const filters: Array<[string, unknown]> = [];
  const rpc = vi.fn().mockResolvedValue({
    data: {
      phase: 'applied',
      prepared: { binding: savedBinding },
      checkpoint: assignedEventId ? { targetEventId: assignedEventId } : null,
    },
    error: null,
  });
  const admin = {
    rpc,
    from: vi.fn((table: string) => {
      const captured = new Map<string, unknown>();
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          captured.set(key, value);
          filters.push([key, value]);
          return query;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            table === 'workspace_calendar_events'
              ? absent
                ? null
                : {
                    provider: moved
                      ? savedBinding.destination.provider
                      : 'google',
                    source_calendar_id: null,
                    external_calendar_id: moved ? 'new' : 'old',
                    external_event_id: moved
                      ? savedBinding.destination.provider !== 'tuturuuu'
                        ? (assignedEventId ??
                          savedBinding.destination.identity.providerEventId)
                        : ''
                      : 'original',
                  }
              : table === 'calendar_connections'
                ? {
                    auth_token_id:
                      captured.get('id') ===
                      '00000000-0000-4000-8000-000000008731'
                        ? '00000000-0000-4000-8000-000000008721'
                        : '00000000-0000-4000-8000-000000008722',
                  }
                : tokenActive
                  ? {
                      id: captured.get('id'),
                      access_token: 'synthetic-fixture',
                      refresh_token: 'synthetic-fixture',
                    }
                  : null,
        }),
      };
      return query;
    }),
  };
  mocks.authorize.mockResolvedValue({
    userId: '00000000-0000-4000-8000-000000008701',
    wsId: '00000000-0000-4000-8000-000000008711',
    sbAdmin: admin,
  });
  mocks.resolveSource.mockImplementation(async ({ source }) => ({
    ...source,
    workspaceCalendarId: null,
    externalCalendarId:
      source.connectionId === '00000000-0000-4000-8000-000000008731'
        ? 'old'
        : 'new',
    accessToken: 'stale-snapshot',
    refreshToken: 'stale-snapshot',
  }));
  return {
    filters,
    rpc,
    remove: () => {
      absent = true;
    },
    revoke: () => {
      tokenActive = false;
    },
    move: () => {
      moved = true;
    },
    access: createRequestProviderSagaAccess(
      new Request('https://example.test'),
      '00000000-0000-4000-8000-000000008711',
      '00000000-0000-4000-8000-000000008741'
    ),
  };
}
describe('fresh dual-endpoint saga request authorization', () => {
  it('reloads both exact actor-owned active tokens and replaces source snapshots', async () => {
    const f = fixture();
    const resolved = await f.access.resolveEndpoint(
      binding,
      binding.destination
    );
    expect(resolved.source.accessToken).toBe('synthetic-fixture');
    expect(f.filters).toContainEqual([
      'id',
      '00000000-0000-4000-8000-000000008721',
    ]);
    expect(f.filters).toContainEqual([
      'id',
      '00000000-0000-4000-8000-000000008722',
    ]);
    expect(f.filters).toContainEqual([
      'user_id',
      '00000000-0000-4000-8000-000000008701',
    ]);
    expect(f.filters).toContainEqual(['is_active', true]);
    f.revoke();
    await expect(
      f.access.resolveEndpoint(binding, binding.destination)
    ).rejects.toMatchObject({ reason: 'unauthorized' });
  });
  it('denies a changed request actor on every subsequent provider resolution', async () => {
    const f = fixture();
    await f.access.assertAllowed(binding);
    mocks.authorize.mockResolvedValueOnce({
      userId: '00000000-0000-4000-8000-000000008702',
    });
    await expect(f.access.assertAllowed(binding)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });
  it('accepts moved row only with the same terminal server binding, and rejects a forged terminal binding', async () => {
    const f = fixture();
    f.move();
    await expect(f.access.assertAllowed(binding)).resolves.toBeUndefined();
    f.rpc.mockResolvedValueOnce({
      data: {
        phase: 'applied',
        prepared: { binding: { ...binding, baseETag: 'different' } },
      },
      error: null,
    });
    await expect(f.access.assertAllowed(binding)).rejects.toMatchObject({
      reason: 'identity',
    });
  });
});

it('authenticates a server-assigned Graph destination ID from the immutable server checkpoint', async () => {
  const graphBinding: SagaBinding = {
    ...binding,
    destination: {
      ...binding.destination,
      provider: 'microsoft',
      identity: {
        ...(binding.destination.provider === 'tuturuuu'
          ? {}
          : binding.destination.identity),
        providerEventId: null,
      },
    } as SagaBinding['destination'],
  };
  const f = fixture(graphBinding, 'assigned-graph-event');
  mocks.resolveSource.mockImplementation(async ({ source }) => ({
    ...source,
    workspaceCalendarId: null,
    externalCalendarId:
      source.connectionId === '00000000-0000-4000-8000-000000008731'
        ? 'old'
        : 'new',
    accessToken: 'stale-snapshot',
    refreshToken: 'stale-snapshot',
  }));
  f.move();
  await expect(f.access.assertAllowed(graphBinding)).resolves.toBeUndefined();
  f.rpc.mockResolvedValueOnce({
    data: {
      phase: 'applied',
      prepared: { binding: graphBinding },
      checkpoint: { targetEventId: 'different-graph-event' },
    },
    error: null,
  });
  await expect(f.access.assertAllowed(graphBinding)).rejects.toMatchObject({
    reason: 'identity',
  });
});

it('recovers only a same-binding terminal persisted deletion with fresh both-endpoint authorization', async () => {
  const f = fixture();
  f.remove();
  const terminal = {
    phase: 'superseded',
    deleted: true,
    prepared: { binding },
    checkpoint: { step: 'target-removed', targetEventId: 'target' },
  };
  f.rpc.mockResolvedValue({ data: terminal, error: null });
  await expect(f.access.assertAllowed(binding)).resolves.toBeUndefined();
  for (const changed of [
    { ...terminal, deleted: false },
    { ...terminal, phase: 'dispatched' },
    { ...terminal, checkpoint: { step: 'target-created' } },
    { ...terminal, prepared: { binding: { ...binding, baseETag: 'forged' } } },
  ]) {
    f.rpc.mockResolvedValueOnce({ data: changed, error: null });
    await expect(f.access.assertAllowed(binding)).rejects.toMatchObject({
      reason: 'identity',
    });
  }
  f.revoke();
  await expect(f.access.assertAllowed(binding)).rejects.toMatchObject({
    reason: 'unauthorized',
  });
});
