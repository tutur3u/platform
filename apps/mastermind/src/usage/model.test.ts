import { describe, expect, it } from 'vitest';
import type { FleetUsageSnapshot } from '../../../web/src/lib/mastermind/fleet/usage-contract';
import { accountingGaps, readiness, windowKinds } from './model';

type Machine = FleetUsageSnapshot['machines'][number];
type Account = Machine['accounts'][number];

const NOW = Date.parse('2026-11-22T03:15:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'personal',
  provider: 'claudeAgent',
  instance: 'personal',
  email: null,
  plan: null,
  checkedAt: at(5 * 60_000),
  status: { kind: 'available' },
  windows: [{ kind: 'weekly', usedPercent: 72, resetsAt: null }],
  ...overrides,
});

const machine = (overrides: Partial<Machine> = {}): Machine => ({
  id: 'skr-m4',
  label: 'M4',
  quota: { kind: 'complete', observedAt: at(20_000) },
  accounting: { kind: 'complete', observedAt: at(20_000) },
  accounts: [account()],
  buckets: [],
  ...overrides,
});

// Shapes the M4 publisher sent on 2026-11-22.
describe('usage readiness', () => {
  it('counts an account checked minutes ago as current', () => {
    const m = machine();
    expect(readiness(m, m.accounts, NOW)).toEqual({
      kind: 'available',
      instances: ['personal'],
    });
    const old = machine({
      accounts: [account({ checkedAt: at(16 * 60_000) })],
    });
    expect(readiness(old, old.accounts, NOW).kind).toBe('unconfirmed');
  });

  it('names why a machine was not read or cannot run', () => {
    const refused = machine({
      quota: { kind: 'unavailable', reason: 'reader_refused' },
      accounts: [],
    });
    expect(readiness(refused, [], NOW)).toEqual({
      kind: 'unread',
      reason: 'reader_refused',
    });
    const legacy = machine({ quota: { kind: 'unavailable' }, accounts: [] });
    expect(readiness(legacy, [], NOW)).toEqual({
      kind: 'unread',
      reason: null,
    });
    const limited = machine({
      accounts: [
        account({ status: { kind: 'limited', reason: 'weekly' } }),
        account({
          id: 'cursor',
          status: { kind: 'limited', reason: 'monthly' },
        }),
      ],
    });
    expect(readiness(limited, limited.accounts, NOW).kind).toBe(
      'none_available'
    );
  });

  it('does not say no account can run on old, expired or partial evidence', () => {
    const limited = { status: { kind: 'limited', reason: 'weekly' } } as const;
    const old = machine({
      accounts: [account({ ...limited, checkedAt: at(20 * 60_000) })],
    });
    expect(readiness(old, old.accounts, NOW).kind).toBe('unconfirmed');
    const reset = machine({
      accounts: [
        account({
          ...limited,
          windows: [{ kind: 'weekly', usedPercent: 100, resetsAt: at(60_000) }],
        }),
      ],
    });
    expect(readiness(reset, reset.accounts, NOW).kind).toBe('unconfirmed');
    const partial = machine({
      quota: { kind: 'partial', observedAt: at(20_000) },
      accounts: [account(limited)],
    });
    expect(readiness(partial, partial.accounts, NOW).kind).toBe('unconfirmed');
  });

  it('needs a block, not a missing reading, on every machine account', () => {
    const silent = machine({
      accounts: [
        account({
          status: { kind: 'unknown', reason: 'not_reported' },
          windows: [],
        }),
      ],
    });
    expect(readiness(silent, silent.accounts, NOW).kind).toBe('unconfirmed');
    const signedOut = machine({
      accounts: [
        account({ status: { kind: 'unknown', reason: 'not_authenticated' } }),
      ],
    });
    expect(readiness(signedOut, signedOut.accounts, NOW).kind).toBe(
      'none_available'
    );
    // A provider filter narrows the list, not the machine-wide verdict.
    const capped = account({
      provider: 'claudeAgent',
      status: { kind: 'limited', reason: 'weekly' },
    });
    const mixed = machine({
      accounts: [capped, account({ id: 'codex', provider: 'codex' })],
    });
    expect(readiness(mixed, [capped], NOW).kind).toBe('unconfirmed');
  });

  it('draws a monthly row only when the provider reports one', () => {
    expect(windowKinds(account())).toEqual(['session', 'weekly']);
    expect(
      windowKinds(
        account({
          windows: [{ kind: 'monthly', usedPercent: 100, resetsAt: null }],
        })
      )
    ).toEqual(['session', 'weekly', 'monthly']);
  });

  it('lists each accounting gap instead of one vague line', () => {
    const machines = [
      machine({
        buckets: [
          {
            day: '2026-11-22',
            provider: 'claudeAgent',
            model: 'fixture-model',
            accountId: null,
            uncachedInputTokens: 1,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 1,
            unpricedRecords: 420,
            costUsd: 1.5,
          },
        ],
      }),
      machine({
        id: 'macbook1',
        label: 'Macbook1',
        accounting: { kind: 'unavailable', reason: 'not_configured' },
      }),
      machine({
        id: 'c02',
        label: 'C02',
        accounting: { kind: 'partial', observedAt: at(3 * 60_000) },
      }),
    ];
    expect(
      accountingGaps(
        machines,
        machines.flatMap((m) => m.buckets),
        NOW
      )
    ).toEqual({
      unread: ['Macbook1'],
      partial: ['C02'],
      stale: ['C02'],
      unpriced: 420,
    });
  });
});
