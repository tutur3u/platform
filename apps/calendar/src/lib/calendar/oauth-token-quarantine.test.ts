import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  MAX_DEACTIVATIONS_PER_RUN,
  withCalendarTokenHealthRun,
} from './oauth-token-health';
import { quarantineCalendarAuthToken } from './oauth-token-quarantine';

const token = {
  id: 'token-id',
  ws_id: 'workspace',
  refresh_token: 'refresh-credential-value',
  created_at: '2026-10-26T00:00:00.000001+00:00',
};

function legacyTable(rows: unknown[]) {
  const eq = vi.fn(() => chain);
  const chain = {
    eq,
    select: vi.fn(async () => ({ data: rows, error: null })),
  };
  const update = vi.fn(() => chain);
  return { from: vi.fn(() => ({ update })), update, eq };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('sends only a sha256 fingerprint and the observed reconnect time', async () => {
  const rpc = vi.fn(async () => ({ data: 'deactivated', error: null }));
  expect(
    await quarantineCalendarAuthToken(
      { from: vi.fn(), rpc },
      token,
      'google_invalid_grant'
    )
  ).toBe('deactivated');
  expect(rpc).toHaveBeenCalledWith('quarantine_calendar_auth_token', {
    p_token_id: 'token-id',
    p_ws_id: 'workspace',
    p_credential_fingerprint: createHash('sha256')
      .update('refresh-credential-value')
      .digest('hex'),
    p_observed_created_at: token.created_at,
    p_reason: 'google_invalid_grant',
  });
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(
    'refresh-credential-value'
  );
});

it.each(['fenced', 'already_inactive'] as const)(
  'reports the %s result idempotently',
  async (result) => {
    const rpc = vi.fn(async () => ({ data: result, error: null }));
    expect(
      await quarantineCalendarAuthToken(
        { from: vi.fn(), rpc },
        token,
        'microsoft_invalid_grant'
      )
    ).toBe(result);
  }
);

it('falls back to a metadata-only fence while the migration is pending', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST202' } }));
  const table = legacyTable([{ id: 'token-id' }]);
  expect(
    await quarantineCalendarAuthToken(
      { from: table.from, rpc },
      token,
      'google_invalid_grant'
    )
  ).toBe('deactivated');
  expect(table.update).toHaveBeenCalledWith({ is_active: false });
  expect(table.eq.mock.calls).toEqual([
    ['id', 'token-id'],
    ['ws_id', 'workspace'],
    ['is_active', true],
    ['created_at', token.created_at],
  ]);
});

it('reports a reconnect as fenced on the pending-schema path', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const table = legacyTable([]);
  expect(
    await quarantineCalendarAuthToken(
      { from: table.from },
      token,
      'google_invalid_grant'
    )
  ).toBe('fenced');
});

it('surfaces other database errors without credential detail', async () => {
  const rpc = vi.fn(async () => ({
    data: null,
    error: { code: '57014', message: 'refresh-credential-value' },
  }));
  await expect(
    quarantineCalendarAuthToken(
      { from: vi.fn(), rpc },
      token,
      'google_invalid_grant'
    )
  ).rejects.toThrow('Calendar credential quarantine failed');
});

it('stops quarantining once a run exhausts its budget', async () => {
  const rpc = vi.fn(async () => ({ data: 'deactivated', error: null }));
  const { result } = await withCalendarTokenHealthRun('/test', async () => {
    const outcomes = [];
    for (let i = 0; i <= MAX_DEACTIVATIONS_PER_RUN; i += 1)
      outcomes.push(
        await quarantineCalendarAuthToken(
          { from: vi.fn(), rpc },
          { ...token, id: `token-${i}` },
          'google_invalid_grant'
        )
      );
    return outcomes;
  });
  expect(rpc).toHaveBeenCalledTimes(MAX_DEACTIVATIONS_PER_RUN);
  expect(result.at(-1)).toBe('deactivation_deferred');
});
