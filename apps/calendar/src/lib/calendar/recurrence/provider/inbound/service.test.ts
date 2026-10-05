import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  key: vi.fn(),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: mocks.encrypt,
  decryptEventFromStorage: mocks.decrypt,
  getWorkspaceKey: mocks.key,
}));

import { prepareInboundProviderConnection } from './service';

const wsId = '00000000-0000-4000-8000-000000009811';
const actorId = '00000000-0000-4000-8000-000000009812';
const connectionId = '00000000-0000-4000-8000-000000009813';
const seriesId = '00000000-0000-4000-8000-000000009814';
const rule = {
  version: 1 as const,
  frequency: 'daily' as const,
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'count' as const, count: 5 },
};
const anchor = {
  startLocal: '2026-10-01T09:00:00',
  endLocal: '2026-10-01T10:00:00',
  allDay: false,
};
const binding = {
  series_id: seriesId,
  ws_id: wsId,
  connection_id: connectionId,
  provider: 'microsoft',
  calendar_id: 'calendar',
  master_id: 'master',
  etag: 'v1',
  observation_hash: 'h1',
  metadata_journal: null,
  series: {
    id: seriesId,
    ws_id: wsId,
    revision: 1,
    workspace_calendar_id: null,
    rule,
    anchor,
    payload: { title: 'Retained', description: '', color: 'RED', locked: true },
    exceptions: [
      {
        originalStartLocal: '2026-10-01T09:00:00',
        exception: { cancelled: true },
        payload: null,
      },
      {
        originalStartLocal: '2026-10-02T09:00:00',
        exception: { cancelled: true },
        payload: null,
      },
      {
        originalStartLocal: '2026-10-05T09:00:00',
        exception: { cancelled: true },
        payload: null,
      },
    ],
  },
};
const access = {
  supabase: { rpc: mocks.rpc } as unknown as TypedSupabaseClient,
  wsId,
  actorId,
  connectionId,
  provider: 'microsoft' as const,
  calendarId: 'calendar',
};
const observation = {
  masterId: 'master',
  etag: 'v2',
  rule,
  anchor,
  event: { title: 'Observed', description: '', location: null },
  exceptions: [],
};
const publish = {
  observation,
  master: { privateProviderField: 'metadata fixture' },
  rawExceptions: [],
  representedInstanceIds: ['one', 'one'],
};
function snapshotInput() {
  return mocks.rpc.mock.calls.find(
    ([, args]) => args.p_action === 'snapshot'
  )?.[1].p_input;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.key.mockResolvedValue(Buffer.alloc(32, 7));
  mocks.decrypt.mockImplementation(async (value) => value);
  mocks.encrypt.mockImplementation(async (_ws, payload) => ({
    ...payload,
    title: 'ciphertext',
    is_encrypted: true,
  }));
  mocks.rpc.mockImplementation(async (_name, args) => ({
    data:
      args.p_action === 'readonly-bindings'
        ? []
        : args.p_action === 'bindings'
          ? [structuredClone(binding)]
          : { status: 'applied' },
    error: null,
  }));
});
describe('provider reconciliation publication fence', () => {
  it('preserves cancellations outside covered range and restores only verified in-range slots', async () => {
    const service = await prepareInboundProviderConnection(access);
    await service.publish({
      ...publish,
      coverage: { from: '2026-10-02T00:00:00Z', to: '2026-10-03T00:00:00Z' },
    });
    expect(
      snapshotInput().exceptions.map(
        (value: { originalStartLocal: string }) => value.originalStartLocal
      )
    ).toEqual(['2026-10-01T09:00:00', '2026-10-05T09:00:00']);
    expect(snapshotInput()).toMatchObject({
      expectedBindingETag: 'v1',
      expectedBindingObservationHash: 'h1',
      etag: 'v2',
      representedInstanceIds: ['one'],
      payload: {
        title: 'ciphertext',
        is_encrypted: true,
        color: 'RED',
        locked: true,
      },
    });
    expect(JSON.stringify(snapshotInput())).not.toContain('metadata fixture');
  });
  it('does not retain cancelled slots removed by a new provider COUNT', async () => {
    const service = await prepareInboundProviderConnection(access);
    await service.publish({
      ...publish,
      observation: {
        ...observation,
        rule: { ...rule, end: { type: 'count', count: 2 } },
      },
      coverage: { from: '2026-10-02T00:00:00Z', to: '2026-10-03T00:00:00Z' },
    });
    expect(snapshotInput().exceptions).toHaveLength(1);
  });
  it('keeps the originally captured ETag when authorization sees a newer local publication', async () => {
    const service = await prepareInboundProviderConnection(access);
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data:
        args.p_action === 'readonly-bindings'
          ? []
          : args.p_action === 'bindings'
            ? [{ ...binding, etag: 'v3' }]
            : { status: 'deferred' },
      error: null,
    }));
    expect(await service.publish(publish)).toBe('deferred');
    expect(snapshotInput().expectedBindingETag).toBe('v1');
    expect(snapshotInput().expectedBindingObservationHash).toBe('h1');
  });
  it('rechecks actor permission after provider reads and never publishes after revocation', async () => {
    const service = await prepareInboundProviderConnection(access);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Permission denied' },
    });
    await expect(service.publish(publish)).rejects.toThrow('Permission denied');
    expect(snapshotInput()).toBeUndefined();
  });
  it('fails closed without an encryption key and retains the previous stored projection', async () => {
    const service = await prepareInboundProviderConnection(access);
    mocks.key.mockResolvedValue(null);
    await expect(service.publish(publish)).rejects.toThrow(
      'Encrypted provider journal unavailable'
    );
    expect(snapshotInput()).toBeUndefined();
  });
  it('does not carry a binding from another calendar into an authorized source', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...binding, calendar_id: 'other' }],
      error: null,
    });
    await expect(prepareInboundProviderConnection(access)).rejects.toThrow(
      'source changed'
    );
  });
  it('authenticates retained provider metadata against the owning actor and source', async () => {
    const service = await prepareInboundProviderConnection(access);
    await service.publish(publish);
    const sealed = snapshotInput().metadataJournal;
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data:
        args.p_action === 'readonly-bindings'
          ? []
          : [{ ...binding, metadata_journal: sealed }],
      error: null,
    }));
    const reader = await prepareInboundProviderConnection(access);
    expect(await reader.readRetainedMetadata('master')).toEqual({
      master: publish.master,
      exceptions: [],
    });
    const otherActor = await prepareInboundProviderConnection({
      ...access,
      actorId: '00000000-0000-4000-8000-000000009815',
    });
    await expect(otherActor.readRetainedMetadata('master')).rejects.toThrow(
      'Encrypted provider journal unavailable'
    );
  });
  it('seals unsupported raw rules before publishing and binds the original ETag', async () => {
    const service = await prepareInboundProviderConnection(access);
    expect(
      await service.unsupported(
        {
          provider: 'microsoft',
          masterId: 'master',
          etag: 'v2',
          master: { recurrence: { unsupported: 'private raw rule' } },
          exceptions: [],
        },
        ['one', 'one']
      )
    ).toBe('applied');
    const input = mocks.rpc.mock.calls.find(
      ([, args]) => args.p_action === 'unsupported'
    )?.[1].p_input;
    expect(input).toMatchObject({
      expectedBindingETag: 'v1',
      expectedBindingObservationHash: 'h1',
      etag: 'v2',
      representedInstanceIds: ['one'],
      metadataJournal: { version: 1 },
    });
    expect(JSON.stringify(input)).not.toContain('private raw rule');
  });
  it('rejects unsupported snapshot from another provider before any encrypted write', async () => {
    const service = await prepareInboundProviderConnection(access);
    await expect(
      service.unsupported(
        {
          provider: 'google',
          masterId: 'master',
          etag: 'v2',
          master: {},
          exceptions: [],
        },
        []
      )
    ).rejects.toThrow('source changed');
    expect(
      mocks.rpc.mock.calls.some(([, args]) => args.p_action === 'unsupported')
    ).toBe(false);
  });
  it('rejects readonly bindings from a foreign source', async () => {
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data:
        args.p_action === 'bindings'
          ? []
          : [
              {
                ws_id: wsId,
                connection_id: connectionId,
                provider: 'google',
                calendar_id: 'foreign',
                observation_hash: 'hash',
                master_id: 'master',
                etag: 'v1',
                metadata_journal: { version: 1, ciphertext: 'encrypted' },
              },
            ],
      error: null,
    }));
    await expect(prepareInboundProviderConnection(access)).rejects.toThrow(
      'source changed'
    );
  });
});
