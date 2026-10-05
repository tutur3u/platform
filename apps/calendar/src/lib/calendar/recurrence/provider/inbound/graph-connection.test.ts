import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: vi.fn(),
  decryptEventFromStorage: vi.fn(),
  getWorkspaceKey: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  pages: vi.fn(),
  snapshot: vi.fn(),
  identities: vi.fn(),
  publish: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchCalendarViewPages: mocks.pages,
}));
vi.mock('./service', () => ({
  prepareInboundProviderConnection: mocks.prepare,
}));
vi.mock('./graph-snapshot', () => ({
  readGraphSeriesSnapshot: mocks.snapshot,
}));
vi.mock('./graph-legacy-identities', () => ({
  verifyGraphLegacySeriesIdentities: mocks.identities,
}));

import { reconcileGraphConnectionSeries } from './graph-connection';
import type { InboundProviderAccess } from './service';

const legacy = {
  id: 'mutable-current',
  iCalUId: 'slot-uid',
  subject: 'Fixture',
};
const args = {
  access: {
    supabase: {} as never,
    wsId: 'workspace',
    actorId: 'actor',
    connectionId: 'source',
    provider: 'microsoft',
    calendarId: 'calendar',
  } as InboundProviderAccess,
  api: {} as never,
  from: '2026-10-01T00:00:00Z',
  to: '2026-11-01T00:00:00Z',
  legacyEvents: [legacy] as never,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'true');
  mocks.prepare.mockResolvedValue({
    bindings: [],
    authorize: mocks.authorize,
    publish: mocks.publish,
  });
  mocks.pages.mockResolvedValue([
    {
      id: 'immutable-current',
      seriesMasterId: 'master',
      type: 'occurrence',
      iCalUId: 'slot-uid',
    },
  ]);
  mocks.snapshot.mockResolvedValue({
    observation: { masterId: 'master' },
    master: { exceptionOccurrences: [] },
    coverage: { from: args.from, to: args.to },
  });
  mocks.identities.mockResolvedValue(
    new Map([['master', ['mutable-older-outside-range', 'mutable-current']]])
  );
});
afterEach(() => vi.unstubAllEnvs());
describe('Outlook legacy identity publication integration', () => {
  it('atomically publishes verified old IDs along with the current immutable bridge without duplicate identities', async () => {
    expect(await reconcileGraphConnectionSeries(args)).toEqual([]);
    expect(mocks.identities).toHaveBeenCalledWith({
      access: args.access,
      api: args.api,
      masters: new Set(['master']),
      authorize: mocks.authorize,
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        representedInstanceIds: [
          'immutable-current',
          'mutable-current',
          'mutable-older-outside-range',
        ],
      })
    );
  });
  it('does not publish or hide the current legacy events when old identities cannot be completely verified', async () => {
    mocks.identities.mockRejectedValueOnce(
      new Error('incomplete verification')
    );
    await expect(reconcileGraphConnectionSeries(args)).rejects.toThrow(
      'incomplete verification'
    );
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it('still rejects an incomplete current mutable identity bridge', async () => {
    expect(
      await reconcileGraphConnectionSeries({ ...args, legacyEvents: [] })
    ).toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('keeps default-off legacy behavior without any new source or provider reads', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'false');
    expect(await reconcileGraphConnectionSeries(args)).toBe(args.legacyEvents);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.pages).not.toHaveBeenCalled();
    expect(mocks.identities).not.toHaveBeenCalled();
  });
});
