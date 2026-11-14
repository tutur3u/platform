import { describe, expect, it } from 'vitest';
import {
  type CalendarSyncAccountRef,
  type CalendarSyncHealthInput,
  type CalendarSyncStatus,
  type CalendarSyncStatusInput,
  type CalendarSyncStatusKind,
  calendarSyncIsActive,
  calendarSyncNeedsAttention,
  calendarSyncReconnectProviders,
  calendarSyncStatusLabelKey,
  calendarSyncStatusStyles,
  deriveCalendarSyncStatus,
  type SyncAttentionReason,
  syncAttentionDescriptionKey,
} from './calendar-sync-status';

const LAST_SUCCESS = '2026-11-13T00:00:00.000Z';
const google: CalendarSyncAccountRef = {
  id: 'google-account',
  provider: 'google',
  account_email: 'owner@example.com',
  account_name: null,
};
const quarantined: CalendarSyncAccountRef = {
  id: 'quarantined',
  provider: 'microsoft',
  account_email: null,
  account_name: 'Owner Outlook',
};

function health(overrides: Partial<CalendarSyncHealthInput> = {}) {
  return {
    state: 'healthy',
    reason: 'ok',
    lastSuccessAt: LAST_SUCCESS,
    currentlyRunning: false,
    ...overrides,
  } satisfies CalendarSyncHealthInput;
}

function input(
  overrides: Partial<CalendarSyncStatusInput> = {}
): CalendarSyncStatusInput {
  return {
    status: { health: health() },
    queryErrored: false,
    accountsLoaded: true,
    accounts: [google],
    needsReconnectAccounts: [],
    providerAccountStatuses: {},
    syncMutation: { isPending: false, isError: false, submittedAt: 0 },
    ...overrides,
  };
}

const degraded = (reason: string) =>
  input({ status: { health: health({ state: 'degraded', reason }) } });

describe('deriveCalendarSyncStatus kinds', () => {
  it.each<[string, CalendarSyncStatusInput, CalendarSyncStatusKind]>([
    ['no response yet', input({ status: undefined }), 'loading'],
    [
      'a manual sync before the first response',
      input({
        status: undefined,
        syncMutation: { isPending: true, isError: false, submittedAt: 1 },
      }),
      'syncing',
    ],
    [
      'no accounts',
      input({
        accounts: [],
        status: { health: health({ state: 'disconnected' }) },
      }),
      'disconnected',
    ],
    [
      'a disconnected response before the accounts response',
      input({
        accounts: [],
        accountsLoaded: false,
        status: { health: health({ state: 'disconnected' }) },
      }),
      'loading',
    ],
    [
      'a disconnected response that disagrees with loaded accounts',
      input({ status: { health: health({ state: 'disconnected' }) } }),
      'loading',
    ],
    [
      'a failed accounts request that returned no list',
      input({
        accounts: [],
        accountsLoaded: false,
        queryErrored: true,
        status: { health: health({ state: 'disconnected' }) },
      }),
      'status_error',
    ],
    [
      'a running sync',
      input({
        status: {
          health: health({ state: 'syncing', currentlyRunning: true }),
        },
      }),
      'syncing',
    ],
    [
      'a pending manual sync on healthy status',
      input({
        syncMutation: { isPending: true, isError: false, submittedAt: 1 },
      }),
      'syncing',
    ],
    ['healthy status', input(), 'healthy'],
    [
      'no calendars selected',
      input({ status: { health: health({ state: 'paused' }) } }),
      'paused',
    ],
    ['degraded status', degraded('sync_stalled'), 'attention'],
    [
      'a failed status request',
      input({ queryErrored: true, status: undefined }),
      'status_error',
    ],
    [
      'a failed request with stale degraded data',
      { ...degraded('auth'), queryErrored: true },
      'status_error',
    ],
  ])('%s', (_, value, kind) => {
    expect(deriveCalendarSyncStatus(value).kind).toBe(kind);
  });

  it('keeps the last success time and failed calendars on attention', () => {
    const failedCalendars = [
      { connectionId: 'c1', calendarName: 'Team', code: 'not_found' },
    ];
    expect(
      deriveCalendarSyncStatus({
        ...degraded('sync_stale'),
        status: {
          health: health({ state: 'degraded', reason: 'sync_stale' }),
          failedCalendars,
        },
      })
    ).toEqual({
      kind: 'attention',
      reason: 'sync_stale',
      accounts: [],
      failedCalendars,
      lastSuccessAt: LAST_SUCCESS,
      syncing: false,
    });
  });
});

describe('deriveCalendarSyncStatus attention reasons', () => {
  it.each<[string, CalendarSyncStatusInput, SyncAttentionReason]>([
    ['sync_stalled', degraded('sync_stalled'), 'sync_stalled'],
    ['sync_stale', degraded('sync_stale'), 'sync_stale'],
    ['not_synced', degraded('not_synced'), 'not_synced'],
    ['auth', degraded('auth'), 'auth'],
    ['configuration', degraded('configuration'), 'configuration'],
    ['api_limit', degraded('api_limit'), 'api_limit'],
    [
      'server reconnect_required',
      degraded('reconnect_required'),
      'reconnect_required',
    ],
    ['last_run_failed', degraded('last_run_failed'), 'last_run_failed'],
    ['an unlisted server reason', degraded('quota_exploded'), 'unknown'],
    [
      'an account the provider rejected',
      input({
        providerAccountStatuses: {
          [google.id]: { state: 'reconnect_required' },
        },
      }),
      'reconnect_required',
    ],
    [
      'a quarantined account on healthy status',
      input({ needsReconnectAccounts: [quarantined] }),
      'reconnect_required',
    ],
    [
      'a temporary provider outage',
      input({
        providerAccountStatuses: {
          [google.id]: { state: 'temporarily_unavailable' },
        },
      }),
      'provider_unavailable',
    ],
    [
      'an outage outranks a degraded reason',
      {
        ...degraded('sync_stalled'),
        providerAccountStatuses: {
          other: { state: 'temporarily_unavailable' },
        },
      },
      'provider_unavailable',
    ],
    [
      'a manual sync that failed after the last success',
      input({
        syncMutation: {
          isPending: false,
          isError: true,
          submittedAt: Date.parse(LAST_SUCCESS) + 1,
        },
      }),
      'last_run_failed',
    ],
    [
      'a manual sync that reported a partial failure',
      input({
        syncMutation: {
          isPending: false,
          isError: false,
          submittedAt: Date.parse(LAST_SUCCESS) + 1,
          data: { ok: false },
        },
      }),
      'last_run_failed',
    ],
    [
      'an unknown account rejected while healthy',
      input({
        providerAccountStatuses: { orphan: { state: 'reconnect_required' } },
      }),
      'last_run_failed',
    ],
  ])('%s', (_, value, reason) => {
    const status = deriveCalendarSyncStatus(value);
    expect(status).toMatchObject({ kind: 'attention', reason });
  });

  it('ignores a failed manual sync that a later success superseded', () => {
    const status = deriveCalendarSyncStatus(
      input({
        syncMutation: {
          isPending: false,
          isError: true,
          submittedAt: Date.parse(LAST_SUCCESS) - 1,
        },
      })
    );
    expect(status.kind).toBe('healthy');
  });

  it('lists rejected active accounts before quarantined ones', () => {
    const status = deriveCalendarSyncStatus(
      input({
        providerAccountStatuses: {
          [google.id]: { state: 'reconnect_required' },
        },
        needsReconnectAccounts: [quarantined],
      })
    );
    expect(status).toMatchObject({ accounts: [google, quarantined] });
  });

  it('keeps a warning visible while a sync runs', () => {
    const status = deriveCalendarSyncStatus({
      ...degraded('sync_stalled'),
      providerAccountStatuses: {
        [google.id]: { state: 'reconnect_required' },
      },
      status: {
        health: health({
          state: 'syncing',
          currentlyRunning: true,
        }),
      },
    });
    expect(status).toMatchObject({ kind: 'attention', syncing: true });
    expect(calendarSyncIsActive(status)).toBe(true);
    expect(calendarSyncNeedsAttention(status)).toBe(true);
  });
});

describe('syncAttentionDescriptionKey', () => {
  it.each<[SyncAttentionReason, string]>([
    ['sync_stalled', 'sync_recovery.stalled'],
    ['sync_stale', 'sync_recovery.stale'],
    ['not_synced', 'sync_recovery.not_synced'],
    ['reconnect_required', 'sync_recovery.reconnect_description'],
    ['auth', 'sync_recovery.reconnect_description'],
    ['configuration', 'sync_recovery.configuration'],
    ['api_limit', 'sync_recovery.rate_limited'],
    ['provider_unavailable', 'sync_recovery.provider_unavailable'],
    ['last_run_failed', 'sync_recovery.failed'],
    ['unknown', 'sync_recovery.failed'],
  ])('%s → %s', (reason, key) => {
    expect(syncAttentionDescriptionKey(reason)).toBe(key);
  });
});

describe('pill copy and styles', () => {
  const statuses: CalendarSyncStatus[] = [
    { kind: 'loading' },
    { kind: 'disconnected' },
    { kind: 'syncing', failedCalendars: [], lastSuccessAt: null },
    { kind: 'healthy', lastSuccessAt: LAST_SUCCESS },
    { kind: 'paused', lastSuccessAt: null },
    {
      kind: 'attention',
      reason: 'sync_stale',
      accounts: [],
      failedCalendars: [],
      lastSuccessAt: null,
      syncing: false,
    },
    {
      kind: 'status_error',
      accounts: [],
      failedCalendars: [],
      lastSuccessAt: null,
      syncing: false,
    },
  ];

  it('maps every kind to a status label and style', () => {
    expect(
      statuses.map((status) => [
        status.kind,
        calendarSyncStatusLabelKey(status),
        calendarSyncStatusStyles(status),
      ])
    ).toMatchInlineSnapshot(`
      [
        [
          "loading",
          "sync_recovery.checking",
          "bg-muted text-muted-foreground",
        ],
        [
          "disconnected",
          "sync_recovery.not_connected",
          "bg-muted text-muted-foreground",
        ],
        [
          "syncing",
          "syncing_calendars",
          "bg-dynamic-blue/10 text-dynamic-blue",
        ],
        [
          "healthy",
          "healthy",
          "bg-dynamic-green/10 text-dynamic-green",
        ],
        [
          "paused",
          "sync_recovery.paused",
          "bg-muted text-muted-foreground",
        ],
        [
          "attention",
          "degraded",
          "bg-dynamic-orange/10 text-dynamic-orange",
        ],
        [
          "status_error",
          "sync_recovery.unavailable",
          "bg-dynamic-red/10 text-dynamic-red",
        ],
      ]
    `);
  });
});

describe('calendarSyncReconnectProviders', () => {
  const attention = (
    reason: SyncAttentionReason,
    accounts: CalendarSyncAccountRef[] = []
  ): CalendarSyncStatus => ({
    kind: 'attention',
    reason,
    accounts,
    failedCalendars: [],
    lastSuccessAt: null,
    syncing: false,
  });

  it('offers only the affected providers', () => {
    expect([
      ...calendarSyncReconnectProviders(
        attention('reconnect_required', [quarantined]),
        [google]
      ),
    ]).toEqual(['microsoft']);
  });

  it('falls back to connected providers, then both, for credential failures', () => {
    expect([
      ...calendarSyncReconnectProviders(attention('auth'), [google]),
    ]).toEqual(['google']);
    expect([...calendarSyncReconnectProviders(attention('auth'), [])]).toEqual([
      'google',
      'microsoft',
    ]);
  });

  it('never offers OAuth for outages or non-warning states', () => {
    expect(
      calendarSyncReconnectProviders(attention('provider_unavailable'), [
        google,
      ]).size
    ).toBe(0);
    expect(
      calendarSyncReconnectProviders({ kind: 'loading' }, [google]).size
    ).toBe(0);
  });
});

/**
 * Exhaustive enumeration over every combination of the inputs that steer the
 * derivation. The domain is finite, so this checks the invariants for all
 * cases rather than a random sample.
 */
describe('deriveCalendarSyncStatus invariants', () => {
  const healthStates: CalendarSyncHealthInput['state'][] = [
    'paused',
    'disconnected',
    'syncing',
    'healthy',
    'degraded',
  ];
  const healthOptions: (CalendarSyncHealthInput | undefined)[] = [undefined];
  for (const state of healthStates)
    for (const currentlyRunning of [false, true])
      for (const reason of ['ok', 'auth', 'sync_stalled', 'other'])
        for (const lastSuccessAt of [null, LAST_SUCCESS])
          healthOptions.push(
            health({ state, currentlyRunning, reason, lastSuccessAt })
          );
  const after = Date.parse(LAST_SUCCESS) + 1;
  const mutations: CalendarSyncStatusInput['syncMutation'][] = [
    { isPending: false, isError: false, submittedAt: 0 },
    { isPending: true, isError: false, submittedAt: after },
    { isPending: false, isError: true, submittedAt: after },
    {
      isPending: false,
      isError: false,
      submittedAt: after,
      data: { ok: false },
    },
  ];
  const providerStatuses: CalendarSyncStatusInput['providerAccountStatuses'][] =
    [
      {},
      { [google.id]: { state: 'connected' } },
      { [google.id]: { state: 'reconnect_required' } },
      { [google.id]: { state: 'temporarily_unavailable' } },
    ];
  const cases: CalendarSyncStatusInput[] = [];
  for (const healthOption of healthOptions)
    for (const queryErrored of [false, true])
      for (const accountsLoaded of [false, true])
        for (const syncMutation of mutations)
          for (const providerAccountStatuses of providerStatuses)
            for (const needsReconnectAccounts of [[], [quarantined]])
              for (const accounts of [[], [google]])
                cases.push({
                  status: healthOption && { health: healthOption },
                  queryErrored,
                  accountsLoaded,
                  syncMutation,
                  providerAccountStatuses,
                  needsReconnectAccounts,
                  accounts,
                });

  it('covers the whole input domain', () => {
    expect(cases.length).toBe(81 * 2 * 2 * 4 * 4 * 2 * 2);
  });

  it('reports status_error exactly when a request failed', () => {
    for (const value of cases)
      expect(deriveCalendarSyncStatus(value).kind === 'status_error').toBe(
        value.queryErrored
      );
  });

  it('never shows failure or attention copy while loading', () => {
    for (const value of cases) {
      if (value.status || value.queryErrored) continue;
      const status = deriveCalendarSyncStatus(value);
      expect(['loading', 'syncing']).toContain(status.kind);
      expect(calendarSyncNeedsAttention(status)).toBe(false);
      expect(calendarSyncStatusLabelKey(status)).not.toBe(
        'sync_recovery.unavailable'
      );
      expect(calendarSyncStatusStyles(status)).not.toContain('dynamic-red');
    }
  });

  it('is loading only before the first response or an unconfirmed disconnect', () => {
    for (const value of cases) {
      if (deriveCalendarSyncStatus(value).kind !== 'loading') continue;
      expect(value.queryErrored).toBe(false);
      if (!value.status) {
        expect(value.syncMutation.isPending).toBe(false);
        continue;
      }
      expect(value.status.health.state).toBe('disconnected');
      expect(value.accountsLoaded && !value.accounts.length).toBe(false);
    }
  });

  it('is disconnected only after an empty, successful accounts response', () => {
    for (const value of cases) {
      if (deriveCalendarSyncStatus(value).kind !== 'disconnected') continue;
      expect(value.queryErrored).toBe(false);
      expect(value.accountsLoaded).toBe(true);
      expect(value.accounts).toHaveLength(0);
    }
  });

  it('always reports a running sync as active', () => {
    for (const value of cases) {
      const running =
        value.syncMutation.isPending || !!value.status?.health.currentlyRunning;
      if (running)
        expect(calendarSyncIsActive(deriveCalendarSyncStatus(value))).toBe(
          true
        );
    }
  });

  it('warns for every degraded response', () => {
    for (const value of cases) {
      if (value.status?.health.state !== 'degraded') continue;
      expect(calendarSyncNeedsAttention(deriveCalendarSyncStatus(value))).toBe(
        true
      );
    }
  });
});
