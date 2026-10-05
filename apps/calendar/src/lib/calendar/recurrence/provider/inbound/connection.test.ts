import type { calendar_v3 } from '@tuturuuu/google';
import type { createGraphClient } from '@tuturuuu/microsoft';
import type { MicrosoftCalendarEvent } from '@tuturuuu/microsoft/calendar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  google: vi.fn(),
  graph: vi.fn(),
  view: vi.fn(),
  publish: vi.fn(),
  deleted: vi.fn(),
  authorize: vi.fn(),
  legacyIdentities: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: vi.fn(),
  decryptEventFromStorage: vi.fn(),
  getWorkspaceKey: vi.fn(),
}));
vi.mock('./service', () => ({
  prepareInboundProviderConnection: mocks.prepare,
}));
vi.mock('./google-snapshot', () => ({
  readGoogleSeriesSnapshot: mocks.google,
}));
vi.mock('./graph-legacy-identities', () => ({
  verifyGraphLegacySeriesIdentities: mocks.legacyIdentities,
}));
vi.mock('./graph-snapshot', () => ({ readGraphSeriesSnapshot: mocks.graph }));
vi.mock('@tuturuuu/microsoft/calendar', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchCalendarViewPages: mocks.view,
}));

import { reconcileGoogleConnectionSeries } from './google-connection';
import { reconcileGraphConnectionSeries } from './graph-connection';
import { ProviderSeriesDeletedError } from './snapshot-errors';

const connectionId = '00000000-0000-4000-8000-000000009811';
const access = {
  supabase: {} as TypedSupabaseClient,
  wsId: connectionId,
  actorId: connectionId,
  connectionId,
  provider: 'microsoft' as const,
  calendarId: 'calendar',
};
const rule = {
  version: 1 as const,
  frequency: 'daily' as const,
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'count' as const, count: 3 },
};
const anchor = {
  startLocal: '2026-10-01T09:00:00',
  endLocal: '2026-10-01T10:00:00',
  allDay: false,
};
const observation = {
  masterId: 'master',
  etag: 'v2',
  rule,
  anchor,
  event: { title: 'Fixture', description: '', location: null },
  exceptions: [],
};
let bindings: {
  master_id: string;
  series: { rule: typeof rule; anchor: typeof anchor };
}[];
const graphArgs = {
  access,
  api: {} as ReturnType<typeof createGraphClient>,
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-04T00:00:00Z',
  legacyEvents: [] as MicrosoftCalendarEvent[],
};
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({
    data: { id: connectionId, color: 'BLUE' },
    error: null,
  }),
};
const googleArgs = {
  supabase: { from: () => query } as unknown as TypedSupabaseClient,
  wsId: connectionId,
  authTokenId: connectionId,
  actorId: connectionId,
  calendarId: 'calendar',
  api: {} as calendar_v3.Calendar,
  events: [] as calendar_v3.Schema$Event[],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'true');
  bindings = [];
  mocks.prepare.mockImplementation(async () => ({
    bindings,
    authorize: mocks.authorize,
    publish: mocks.publish,
    deleted: mocks.deleted,
  }));
  mocks.publish.mockResolvedValue('applied');
  mocks.deleted.mockResolvedValue('deleted');
  mocks.view.mockResolvedValue([]);
  mocks.google.mockResolvedValue({
    observation,
    master: { id: 'master' },
    exceptions: [],
  });
  mocks.graph.mockResolvedValue({
    observation,
    master: { id: 'master', exceptionOccurrences: [] },
    coverage: { from: graphArgs.from, to: graphArgs.to },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('live connection recurrence reconciliation', () => {
  it('leaves legacy sync untouched and never reads provider masters when admission is disabled', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'false');
    expect(await reconcileGoogleConnectionSeries(googleArgs)).toBe(
      googleArgs.events
    );
    expect(await reconcileGraphConnectionSeries(graphArgs)).toBe(
      graphArgs.legacyEvents
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it('publishes a Google master before suppressing represented expanded instances', async () => {
    const events = [
      { id: 'one', recurringEventId: 'master' },
      { id: 'ordinary' },
    ];
    expect(
      await reconcileGoogleConnectionSeries({ ...googleArgs, events })
    ).toEqual([{ id: 'ordinary' }]);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ representedInstanceIds: ['one', 'master'] })
    );
  });
  it('suppresses deferred Google publication so an outbound pending operation cannot duplicate the canonical master', async () => {
    mocks.publish.mockResolvedValue('deferred');
    expect(
      await reconcileGoogleConnectionSeries({
        ...googleArgs,
        events: [{ id: 'one', recurringEventId: 'master' }],
      })
    ).toEqual([]);
  });
  it('recognizes Google id-only master deletion tombstones by retained binding', async () => {
    bindings = [{ master_id: 'master', series: { rule, anchor } }];
    mocks.google.mockRejectedValue(new ProviderSeriesDeletedError());
    expect(
      await reconcileGoogleConnectionSeries({
        ...googleArgs,
        events: [{ id: 'master', status: 'cancelled' }],
      })
    ).toEqual([]);
    expect(mocks.deleted).toHaveBeenCalledWith('master');
  });
  it('leaves richer unsupported new Google rules in ordinary read-only provider projection', async () => {
    mocks.google.mockRejectedValue(new RangeError('Unsupported'));
    const events = [{ id: 'one', recurringEventId: 'master' }];
    expect(
      await reconcileGoogleConnectionSeries({ ...googleArgs, events })
    ).toEqual(events);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('never leaks raw credential-bearing SDK errors into existing sync logs', async () => {
    mocks.google.mockRejectedValue(new Error('private credential fixture'));
    await expect(
      reconcileGoogleConnectionSeries({
        ...googleArgs,
        events: [{ id: 'one', recurringEventId: 'master' }],
      })
    ).rejects.toThrow('Provider recurring snapshot unavailable');
  });
  it('rechecks relevant retained Outlook masters even when every occurrence disappeared from a complete view', async () => {
    bindings = [{ master_id: 'master', series: { rule, anchor } }];
    mocks.graph.mockRejectedValue({ statusCode: 404 });
    expect(await reconcileGraphConnectionSeries(graphArgs)).toEqual([]);
    expect(mocks.deleted).toHaveBeenCalledWith('master');
  });
  it('bridges immutable Outlook identities to mutable legacy rows only by unique occurrence iCalUId', async () => {
    mocks.view.mockResolvedValue([
      { id: 'immutable', seriesMasterId: 'master', iCalUId: 'uid' },
    ]);
    const legacyEvents = [
      { id: 'mutable', iCalUId: 'uid' },
    ] as MicrosoftCalendarEvent[];
    expect(
      await reconcileGraphConnectionSeries({ ...graphArgs, legacyEvents })
    ).toEqual([]);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        representedInstanceIds: ['immutable', 'mutable'],
      })
    );
  });
  it('rejects a missing Outlook identity bridge without destructive canonical publication', async () => {
    bindings = [{ master_id: 'master', series: { rule, anchor } }];
    mocks.view.mockResolvedValue([
      { id: 'immutable', seriesMasterId: 'master', iCalUId: 'uid' },
    ]);
    await expect(reconcileGraphConnectionSeries(graphArgs)).rejects.toThrow(
      'Provider recurring snapshot unavailable'
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
