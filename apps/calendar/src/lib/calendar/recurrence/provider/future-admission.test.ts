import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  source: vi.fn(),
  master: vi.fn(),
  refresh: vi.fn(),
  seal: vi.fn(),
  encrypt: vi.fn(),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: mocks.encrypt,
  decryptEventFromStorage: async (value: unknown) => value,
  getWorkspaceKey: vi.fn(),
}));
vi.mock('../../source-resolver', () => ({
  resolveCalendarSource: mocks.source,
}));
vi.mock('../../token-refresh', () => ({ ensureValidToken: mocks.refresh }));
vi.mock('./inspect', () => ({
  createSeriesProviderInspector: () => ({ master: mocks.master }),
}));
vi.mock('../../provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));
vi.mock(
  '../../google-color-operations/sealed-journal',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createSealedJournalCodec: () => ({ seal: mocks.seal }),
  })
);

import { reserveProviderOperation } from './request-service';

const id = '00000000-0000-4000-8000-000000009841';
const seriesId = '00000000-0000-4000-8000-000000009842';
const wsId = '00000000-0000-4000-8000-000000009843';
const userId = '00000000-0000-4000-8000-000000009844';
const connectionId = '00000000-0000-4000-8000-000000009845';
const rule = {
  version: 1,
  frequency: 'daily',
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'count', count: 5 },
};
const series = {
  id: seriesId,
  ws_id: wsId,
  revision: 1,
  workspace_calendar_id: null,
  rule,
  anchor: {
    startLocal: '2026-10-01T09:00:00',
    endLocal: '2026-10-01T10:00:00',
    allDay: false,
  },
  payload: { title: 'Fixture', description: '<p>Fixture</p>', location: null },
  exceptions: [],
};
let provider: 'google' | 'microsoft';
const from = () => {
  let table = '';
  const request = {
    select: () => request,
    eq: () => request,
    single: async () => ({
      data:
        table === 'calendar_connections'
          ? { auth_token_id: id, sync_outbound_enabled: true }
          : { id, provider, access_token: 'fixture-not-a-credential' },
      error: null,
    }),
  };
  return (name: string) => {
    table = name;
    return request;
  };
};
const access = {
  sbAdmin: { rpc: mocks.rpc, from: from() } as unknown as TypedSupabaseClient,
  wsId,
  userId,
};
const intent = () => ({
  requestId: id,
  action: 'update',
  source: { provider, connectionId },
  seriesId,
  expectedRevision: 1,
  scope: 'future',
  originalStartLocal: '2026-10-03T09:00:00',
  event: { title: 'Changed' },
});
function reserved() {
  return mocks.rpc.mock.calls.find(([, args]) => args.p_action === 'reserve');
}
beforeEach(() => {
  vi.clearAllMocks();
  provider = 'google';
  mocks.source.mockImplementation(async () => ({
    provider,
    connectionId,
    externalCalendarId: 'calendar',
    workspaceCalendarId: null,
    accessToken: 'fixture-not-a-credential',
  }));
  mocks.refresh.mockResolvedValue({ accessToken: 'fixture-not-a-credential' });
  mocks.encrypt.mockImplementation(async (_ws, value) => ({
    ...value,
    title: 'ciphertext',
    is_encrypted: true,
  }));
  mocks.seal.mockResolvedValue({ version: 1, ciphertext: 'sealed-plan' });
  mocks.master.mockResolvedValue({
    event: {
      organizer: { self: true },
      attendees: [
        { email: 'guest@example.invalid', responseStatus: 'accepted' },
      ],
      visibility: 'private',
    },
    etag: 'v1',
  });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'calendar_provider_series_is_readonly')
      return { data: false, error: null };
    if (name === 'calendar_series_operation')
      return { data: series, error: null };
    if (args.p_action === 'read')
      return {
        data: null,
        error: { code: 'P0002', message: 'Missing operation' },
      };
    if (args.p_action === 'binding')
      return {
        data: {
          connection_id: connectionId,
          provider,
          calendar_id: 'calendar',
          master_id: 'master',
          etag: 'v1',
        },
        error: null,
      };
    if (args.p_action === 'reserve')
      return {
        data: {
          id,
          ws_id: wsId,
          actor_id: userId,
          connection_id: connectionId,
          series_id: seriesId,
          native_action: 'update',
          native_input: args.p_input.nativeInput,
          intent_hash: args.p_input.intentHash,
          journal: args.p_input.journal,
          step_count: 2,
          checkpoints: [],
          phase: 'prepared',
          lease: null,
          result: null,
        },
        error: null,
      };
    throw new Error(`Unexpected action ${args.p_action}`);
  });
});
describe('future split admission before remote effects', () => {
  it('seals freshly read safe guest fields into the recoverable create step before reserving the trim', async () => {
    await reserveProviderOperation(access, intent());
    const plan = mocks.seal.mock.calls[0]?.[1];
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].kind).toBe('trim');
    expect(plan.steps[1].metadata).toEqual({
      provider: 'google',
      fields: {
        attendees: [{ email: 'guest@example.invalid' }],
        visibility: 'private',
      },
    });
    expect(reserved()).toBeDefined();
    expect(JSON.stringify(reserved())).not.toContain('guest@example.invalid');
  });
  it.each([
    { organizer: { self: true }, conferenceData: { conferenceId: 'fixture' } },
    {
      organizer: { self: true },
      attachments: [{ title: 'missing required reference' }],
    },
    { organizer: { self: true }, attendeesOmitted: true },
    { organizer: { self: false } },
  ])(
    'does not reserve any partial trim for non-cloneable fresh Google state %j',
    async (event) => {
      mocks.master.mockResolvedValue({ event, etag: 'v1' });
      await expect(
        reserveProviderOperation(access, intent())
      ).rejects.toThrow();
      expect(reserved()).toBeUndefined();
      expect(mocks.seal).not.toHaveBeenCalled();
    }
  );
  it('preserves Outlook HTML body format when description is unchanged', async () => {
    provider = 'microsoft';
    mocks.master.mockResolvedValue({
      event: {
        isOrganizer: true,
        body: { contentType: 'html', content: '<p>Fixture</p>' },
      },
      etag: 'v1',
    });
    await reserveProviderOperation(access, intent());
    expect(
      mocks.seal.mock.calls[0]?.[1].steps[1].metadata.fields.body.contentType
    ).toBe('html');
  });
  it('uses explicit text for an intentionally changed Outlook description', async () => {
    provider = 'microsoft';
    mocks.master.mockResolvedValue({
      event: {
        isOrganizer: true,
        body: { contentType: 'html', content: '<p>Fixture</p>' },
      },
      etag: 'v1',
    });
    await reserveProviderOperation(access, {
      ...intent(),
      event: { title: 'Changed', description: 'New text' },
    });
    expect(
      mocks.seal.mock.calls[0]?.[1].steps[1].metadata.fields.body
    ).toBeUndefined();
  });
  it('rejects changed authoritative master revision before retaining any split plan', async () => {
    mocks.master.mockResolvedValue({ event: {}, etag: 'v2' });
    await expect(reserveProviderOperation(access, intent())).rejects.toThrow(
      'changed externally'
    );
    expect(reserved()).toBeUndefined();
  });
});
