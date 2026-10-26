import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import type { CalendarTokenOutcomeEntry } from './oauth-token-health';
import {
  MAX_SYNC_CONNECTIONS,
  MAX_SYNC_WORKSPACES,
} from './provider-sync-budget';
import {
  buildProviderSyncEnvelope,
  MAX_ATTENTION_ENTRIES,
  type WorkspaceDispatchResult,
} from './provider-sync-envelope';

// Cron Control's response read limit (apps/cron-control/src/dispatch.ts).
const SCHEDULER_READ_LIMIT = 64 * 1024;

function entry(
  index: number,
  provider: 'google' | 'microsoft',
  outcome: CalendarTokenOutcomeEntry['outcome'],
  extra: Partial<CalendarTokenOutcomeEntry> = {}
): CalendarTokenOutcomeEntry {
  return {
    account: index.toString(16).padStart(16, '0'),
    provider,
    outcome,
    attempts: 3,
    ...extra,
  };
}

function workspace(
  index: number,
  overrides: Partial<WorkspaceDispatchResult> = {}
): WorkspaceDispatchResult {
  return {
    ws_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    success: true,
    completed: true,
    ...overrides,
  };
}

describe('provider-sync scheduler envelope', () => {
  it('stays far below the scheduler read limit at the maximum batch', () => {
    // Every account at both providers in every workspace failing, with the
    // longest provider codes, is the largest body the route can produce.
    const outcomes = Array.from(
      { length: MAX_SYNC_WORKSPACES * MAX_SYNC_CONNECTIONS * 2 },
      (_, index) =>
        entry(index, index % 2 ? 'microsoft' : 'google', 'consensus_hold', {
          reason: 'microsoft_unauthorized_client',
          providerCode: 'unauthorized_client/AADSTS7000112/http_400',
        })
    );
    const results = Array.from({ length: MAX_SYNC_WORKSPACES }, (_, index) =>
      workspace(index, {
        success: false,
        error: 'Calendar sync deadline exceeded',
      })
    );
    const { body } = buildProviderSyncEnvelope(
      { processed: results.length, deferred: 10_000, results },
      outcomes
    );
    const bytes = Buffer.byteLength(JSON.stringify(body));
    expect(bytes).toBeLessThan(SCHEDULER_READ_LIMIT / 4);
    expect(body.tokens.attention).toHaveLength(MAX_ATTENTION_ENTRIES);
    expect(body.tokens.attentionOmitted).toBe(
      outcomes.length - MAX_ATTENTION_ENTRIES
    );
    expect(body.ok).toBe(true);
  });

  it('reports a completed run with account failures as a successful job', () => {
    const { status, body } = buildProviderSyncEnvelope(
      {
        processed: 2,
        deferred: 0,
        results: [
          workspace(1, { success: false, error: 'auth' }),
          workspace(2),
        ],
      },
      [
        entry(1, 'google', 'consensus_hold', {
          reason: 'google_invalid_grant',
        }),
        entry(2, 'google', 'ok', { refreshed: true }),
      ]
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      partialFailure: true,
      failures: [{ error: 'auth' }],
    });
  });

  it('never lets one tenant or held accounts fail the job', () => {
    const tenant = { reason: 'microsoft_unauthorized_client' as const };
    const { body } = buildProviderSyncEnvelope(
      {
        processed: 1,
        deferred: 0,
        results: [workspace(1, { success: false })],
      },
      [
        entry(1, 'microsoft', 'deactivated', tenant),
        entry(2, 'microsoft', 'deactivated', tenant),
        entry(3, 'microsoft', 'consensus_hold', tenant),
        entry(4, 'microsoft', 'consensus_hold', tenant),
        entry(5, 'microsoft', 'consensus_hold', tenant),
        entry(6, 'google', 'ok', { refreshed: true }),
      ]
    );
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty('providers');
  });

  it('fails the job for an explicitly broken client or when nothing completed', () => {
    const broken = buildProviderSyncEnvelope(
      {
        processed: 1,
        deferred: 0,
        results: [workspace(1, { success: false })],
      },
      [1, 2, 3].map((index) => entry(index, 'google', 'systemic'))
    );
    expect(broken.status).toBe(500);
    expect(broken.body).toMatchObject({ ok: false, providers: ['google'] });

    const stalled = buildProviderSyncEnvelope(
      {
        processed: 2,
        deferred: 0,
        results: [
          workspace(1, { success: false, completed: false }),
          workspace(2, { success: false, completed: false }),
        ],
      },
      []
    );
    expect(stalled.status).toBe(200);
    expect(stalled.body).toMatchObject({
      ok: false,
      error: 'No workspace sync completed',
    });

    expect(
      buildProviderSyncEnvelope({ processed: 0, deferred: 0, results: [] }, [])
        .body.ok
    ).toBe(true);
  });
});
