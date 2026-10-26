import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { withCalendarTokenHealthRun } from './oauth-token-health';
import {
  CONSENSUS_ACCOUNTS,
  quarantineCalendarAuthToken,
} from './oauth-token-quarantine';

const token = {
  id: 'token-id',
  ws_id: 'workspace',
  refresh_token: 'refresh-credential-value',
  created_at: '2026-10-26T00:00:00.000001+00:00',
};

// Recent same-reason quarantines, as the breaker reads them.
function database(recent = 0, historyError: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const history = {
    select: vi.fn(() => history),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return history;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return history;
    }),
    limit: vi.fn(async () => ({
      data: historyError ? null : Array.from({ length: recent }, () => ({})),
      error: historyError,
    })),
  };
  const rpc = vi.fn(
    async (
      _fn: string,
      _args: Record<string, unknown>
    ): Promise<{ data: unknown; error: unknown }> => ({
      data: 'deactivated',
      error: null,
    })
  );
  return { from: vi.fn(() => history), rpc, history, filters };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('sends only a sha256 fingerprint and the observed reconnect time', async () => {
  const db = database();
  expect(
    await quarantineCalendarAuthToken(db, token, 'google_invalid_grant')
  ).toBe('deactivated');
  expect(db.rpc).toHaveBeenCalledWith('quarantine_calendar_auth_token', {
    p_token_id: 'token-id',
    p_ws_id: 'workspace',
    p_credential_fingerprint: createHash('sha256')
      .update('refresh-credential-value')
      .digest('hex'),
    p_observed_created_at: token.created_at,
    p_reason: 'google_invalid_grant',
  });
  expect(JSON.stringify([db.rpc.mock.calls, db.filters])).not.toContain(
    'refresh-credential-value'
  );
  expect(db.filters[0]).toEqual(['deactivated_reason', 'google_invalid_grant']);
});

it.each(['fenced', 'already_inactive'] as const)(
  'reports the %s result idempotently',
  async (result) => {
    const db = database();
    db.rpc.mockResolvedValue({ data: result, error: null });
    expect(
      await quarantineCalendarAuthToken(db, token, 'microsoft_invalid_grant')
    ).toBe(result);
  }
);

it.each([
  ['the quarantine RPC is missing', null, { code: 'PGRST202' }],
  ['the quarantine columns are missing', { code: '42703' }, null],
  ['the breaker history is unreadable', { code: '57014' }, null],
])('defers without writing when %s', async (_label, historyError, rpcError) => {
  const db = database(0, historyError);
  if (rpcError) db.rpc.mockResolvedValue({ data: null, error: rpcError });
  expect(
    await quarantineCalendarAuthToken(db, token, 'google_invalid_grant')
  ).toBe('deactivation_deferred');
  if (historyError) expect(db.rpc).not.toHaveBeenCalled();
});

it('surfaces other database errors without credential detail', async () => {
  const db = database();
  db.rpc.mockResolvedValue({
    data: null,
    error: { code: '57014', message: 'refresh-credential-value' },
  });
  await expect(
    quarantineCalendarAuthToken(db, token, 'google_invalid_grant')
  ).rejects.toThrow('Calendar credential quarantine failed');
});

it('trips the in-run breaker on the third account with the same reason', async () => {
  const db = database();
  const { result } = await withCalendarTokenHealthRun('/test', async () => {
    const outcomes = [];
    for (const id of ['a', 'b', 'a', 'c', 'd'])
      outcomes.push(
        await quarantineCalendarAuthToken(
          db,
          { ...token, id },
          'google_invalid_grant'
        )
      );
    outcomes.push(
      await quarantineCalendarAuthToken(
        db,
        { ...token, id: 'e' },
        'microsoft_invalid_grant'
      )
    );
    return outcomes;
  });
  expect(CONSENSUS_ACCOUNTS).toBe(3);
  expect(result).toEqual([
    'deactivated',
    'deactivated',
    'deactivated',
    'systemic',
    'systemic',
    'deactivated',
  ]);
  // One history read per reason per run.
  expect(db.history.limit).toHaveBeenCalledTimes(2);
});

it('admits concurrent workspaces in arrival order', async () => {
  const db = database();
  const { result } = await withCalendarTokenHealthRun('/test', () =>
    Promise.all(
      ['a', 'b', 'c'].map((id) =>
        quarantineCalendarAuthToken(
          db,
          { ...token, id },
          'google_invalid_grant'
        )
      )
    )
  );
  expect(result).toEqual(['deactivated', 'deactivated', 'systemic']);
});

it.each([
  [2, ['systemic']],
  [1, ['deactivated', 'systemic']],
  [0, ['deactivated', 'deactivated', 'systemic']],
])(
  'keeps the breaker open across runs while %i recent quarantines share the reason',
  async (recent, expected) => {
    const db = database(recent);
    const { result } = await withCalendarTokenHealthRun('/test', async () => {
      const outcomes = [];
      for (const id of expected.map((_, index) => `token-${index}`))
        outcomes.push(
          await quarantineCalendarAuthToken(
            db,
            { ...token, id },
            'google_invalid_grant'
          )
        );
      return outcomes;
    });
    expect(result).toEqual(expected);
    expect(db.filters).toContainEqual([
      'deactivated_at',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    ]);
  }
);

it('applies the cross-run breaker to interactive calls outside a run', async () => {
  expect(
    await quarantineCalendarAuthToken(
      database(2),
      token,
      'google_invalid_grant'
    )
  ).toBe('systemic');
  expect(
    await quarantineCalendarAuthToken(
      database(1),
      token,
      'google_invalid_grant'
    )
  ).toBe('deactivated');
});
