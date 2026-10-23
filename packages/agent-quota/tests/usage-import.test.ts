import { describe, expect, it } from 'vitest';
import { collapseAccounts } from '../src/accounts';
import { receiptReset } from '../src/failure-receipt';
import { emptyLedger } from '../src/hook-ledger';
import type { Observation } from '../src/hooks-types';
import { validateUsageImport } from '../src/operator-cli';
import { recommend } from '../src/policy';
import { poolPolicyReasons, validatePoolSettings } from '../src/pool-settings';
import { gateDecision } from '../src/positional-admit';
import { clearRecoveredLimits } from '../src/receipt-expiry';
import type { AccountUsage } from '../src/types';
import {
  applyImportedUsage,
  applyManualUsage,
  homeIdentity,
  manualUsage,
  mergeUsageImport,
} from '../src/usage-import';
import {
  coversModel,
  receiptCovers,
  receiptWindowScope,
  windowScope,
} from '../src/window-scope';

const now = new Date('2026-10-23T05:34:00Z');
const account = (id: string): AccountUsage => ({
  instanceId: id,
  provider: 'claude',
  label: 'mutable',
  available: true,
  models: ['claude-opus'],
  windows: [],
});
const manual = (pool: string, value: number) => ({
  pool,
  sessionRemainingPercent: value,
  kind: 'manual-screenshot',
  capturedLocal: '12:33 Asia/Saigon',
  observedAt: '2026-10-23T05:33:00Z',
});
const observed = (pool: string, value: number) => ({
  ...manualUsage(manual(pool, value)),
  resetAt: '2026-10-23T06:00:00Z',
});
describe('Usage UI and typed manual observations', () => {
  it('converts remaining once, keeps explicit used unchanged, and preserves provenance', () => {
    const a = applyManualUsage(
      [account('claudeAgent'), account('claude_kv')],
      [
        observed('claudeAgent', 0),
        { ...observed('claude_kv', 12), measure: 'used' },
      ]
    );
    expect(a.map((x) => x.windows[0]?.usedPercent)).toEqual([100, 12]);
    expect(a[0]?.windows[0]).toMatchObject({
      confidence: 'manual',
      source: expect.stringContaining('manual-screenshot'),
    });
  });
  it('keys all five screenshot observations by catalog ID through label and order changes', () => {
    const values = [
      ['claudeAgent', 0],
      ['claude_kv', 12],
      ['claude_hehe', 57],
      ['claude_dd', 97],
      ['claude_mira', 100],
    ] as const;
    const a = applyManualUsage(
      values.map(([id]) => account(id)).reverse(),
      values.map(([id, v]) => manual(id, v))
    );
    for (const [id, remaining] of values)
      expect(
        100 - a.find((x) => x.instanceId === id)!.windows[0]!.usedPercent!
      ).toBe(remaining);
    expect(
      recommend({
        accounts: a,
        active: [],
        task: { model: 'claude-opus' },
        now,
      }).ranked.every((x) => x.state === 'UNKNOWN')
    ).toBe(true);
  });
  it('skips malformed observations individually and accepts the stored screenshot metric shape', () => {
    const invalid: string[] = [];
    const result = applyManualUsage(
      [account('claude_dd')],
      [
        { kind: 'provider-cache', pool: 'claude_dd', value: 'bad' },
        {
          kind: 'manual-screenshot',
          pool: 'claude_dd',
          sessionRemainingPercent: 36,
          metric: '5-hour session',
          observedAt: '2026-10-23T06:16:00Z',
          capturedLocal: '13:16 Asia/Saigon',
        },
      ],
      invalid
    );
    expect(invalid).toEqual(['observations[0]: manual-usage-invalid']);
    expect(result[0]?.windows[0]).toMatchObject({
      id: 'five_hour',
      label: '5-hour session',
      usedPercent: 64,
      confidence: 'manual',
    });
  });
  it('reads real settings shape and dedupes identical home paths, never guesses absent paths', () => {
    const settings = {
      providerInstances: {
        claudeAgent: {
          driver: 'claudeAgent',
          config: { homePath: '/fixture/claude_skora' },
        },
        claude_mira: {
          driver: 'claudeAgent',
          config: { homePath: '/fixture/claude_mira' },
        },
      },
    };
    expect(homeIdentity(settings, 'claudeAgent', 'claude')).not.toBe(
      homeIdentity(settings, 'claude_mira', 'claude')
    );
    expect(homeIdentity(settings, 'claude_kv', 'claude')).toBeUndefined();
    const a = applyImportedUsage([account('claudeAgent'), account('alias')], {
      settings: {
        providerInstances: {
          ...settings.providerInstances,
          alias: settings.providerInstances.claudeAgent,
        },
      },
    });
    expect(collapseAccounts(a)).toHaveLength(1);
  });
  it('uses distinct Codex shadow homes and preserves prior imports across manual-only updates', () => {
    const settings = {
      providerInstances: {
        a: {
          driver: 'codex',
          config: { homePath: '/shared', shadowHomePath: '/shadow/a' },
        },
        b: {
          driver: 'codex',
          config: { homePath: '/shared', shadowHomePath: '/shadow/b' },
        },
      },
    };
    expect(homeIdentity(settings, 'a', 'codex')).not.toBe(
      homeIdentity(settings, 'b', 'codex')
    );
    const previous = {
      providers: [
        {
          instanceId: 'a',
          driver: 'codex',
          usageLimits: { checkedAt: now.toISOString(), windows: [] },
        },
      ],
      settings,
    };
    expect(mergeUsageImport(previous, { observations: [] })).toMatchObject(
      previous
    );
  });
  it('keeps scoped weekly windows off other models and trusts checkedAt rather than import time', () => {
    const a = applyImportedUsage([account('claude_dd')], {
      providers: [
        {
          instanceId: 'claude_dd',
          driver: 'claudeAgent',
          usageLimits: {
            checkedAt: '2026-10-23T05:33:00Z',
            windows: [
              {
                id: 'seven_day_fable',
                label: 'Weekly · Fable',
                usedPercent: 100,
                resetsAt: '2026-10-30T05:33:00Z',
              },
            ],
          },
        },
      ],
    });
    expect(
      recommend({
        accounts: a,
        active: [],
        task: { model: 'claude-opus' },
        now,
      }).ranked[0]?.state
    ).toBe('UNKNOWN');
    expect(
      recommend({
        accounts: a,
        active: [],
        task: { model: 'claude-fable' },
        now,
      }).ranked[0]?.state
    ).toBe('exhausted');
  });
  it('blocks exhaustion and needs a fresh post-reset signal to restore known health', () => {
    const a = applyManualUsage(
      [account('claude_mira')],
      [observed('claude_mira', 0)]
    );
    const ctx = { accounts: a, active: [], ledger: emptyLedger(), now };
    expect(gateDecision('claude_mira', 'claude-opus', ctx).exitCode).toBe(3);
    const later = new Date('2026-10-23T06:01:00Z');
    expect(
      gateDecision('claude_mira', 'claude-opus', { ...ctx, now: later }, true)
        .exitCode
    ).toBe(3);
    a[0]!.windows[0] = {
      ...a[0]!.windows[0]!,
      observedAt: later.toISOString(),
      resetsAt: '2026-10-23T11:00:00Z',
      usedPercent: 0,
    };
    expect(
      gateDecision('claude_mira', 'claude-opus', { ...ctx, now: later }, true)
        .exitCode
    ).toBe(0);
  });
  it('takes latest reset across relative, clock and ISO phrases', () => {
    expect(
      receiptReset(
        'resets in 2 hours; resets in 6 days, 23 hours',
        now.toISOString()
      )
    ).toBe('2026-10-30T04:34:00.000Z');
    expect(
      receiptReset(
        'resets 1:00pm; resets 11:00pm',
        now.toISOString(),
        'Asia/Ho_Chi_Minh'
      )
    ).toBe('2026-10-23T16:00:00.000Z');
    expect(
      receiptReset(
        'resets 2026-10-24T00:00:00Z; resets 2026-10-25T00:00:00Z',
        now.toISOString()
      )
    ).toBe('2026-10-25T00:00:00.000Z');
  });
  it('scopes receipts to Argon efforts and Fable rather than all models', () => {
    const argon = {
      windowScope: receiptWindowScope(
        'antigravity',
        'gemini-4-argon-high',
        'Usage Limit Reached'
      ),
    };
    expect(receiptCovers(argon, 'antigravity', 'gemini-4-argon-low')).toBe(
      true
    );
    expect(receiptCovers(argon, 'antigravity', 'gemini-3.8-flash-low')).toBe(
      false
    );
    const fable = {
      windowScope: receiptWindowScope(
        'claude',
        'claude-opus',
        'Weekly · Fable limit reached'
      ),
    };
    expect(receiptCovers(fable, 'claude', 'claude-opus')).toBe(false);
  });
  it.each([
    'Weekly limit',
    'Weekly usage',
    'Weekly total',
    'Current week',
    'Current week (Opus)',
    'Current week (Sonnet only)',
  ])(
    'scopes Claude window label %s only when a model family is named',
    (label) => {
      const scope = windowScope('claude', 'arbitrary_weekly_id', label);
      const window = {
        kind: 'weekly' as const,
        source: 'fixture',
        observedAt: now.toISOString(),
        authoritative: true,
        scope,
      };
      if (label.includes('Opus')) {
        expect(scope).toEqual({ kind: 'models', modelFamilies: ['opus'] });
        expect(coversModel(window, 'claude-opus-4-6')).toBe(true);
        expect(coversModel(window, 'claude-sonnet-4-5')).toBe(false);
      } else if (label.includes('Sonnet')) {
        expect(scope).toEqual({ kind: 'models', modelFamilies: ['sonnet'] });
        expect(coversModel(window, 'claude-sonnet-4-5')).toBe(true);
        expect(coversModel(window, 'claude-opus-4-6')).toBe(false);
      } else {
        expect(scope).toEqual({ kind: 'account' });
        expect(coversModel(window, 'claude-opus-4-6')).toBe(true);
        expect(coversModel(window, 'claude-sonnet-4-5')).toBe(true);
      }
    }
  );
  it('clears a no-reset receipt on a newer fresh partial window and ages it out conservatively', () => {
    const observedAt = '2026-10-23T05:00:00Z';
    const event: Observation = {
      eventId: 'no-reset',
      instanceId: 'claude_mira',
      accountKey: 'claude:test',
      outcome: 'usage-limit' as const,
      observedAt,
    };
    const pool = account('claude_mira');
    pool.windows = [
      {
        kind: 'session',
        usedPercent: 50,
        source: 'cache',
        authoritative: true,
        observedAt: '2026-10-23T05:34:00Z',
        resetsAt: null,
      },
    ];
    const ledger = { ...emptyLedger(), observations: [event] };
    clearRecoveredLimits({ accounts: [pool], active: [], ledger, now });
    expect(event.clearedAt).toBe(now.toISOString());
    const aged = {
      ...event,
      clearedAt: undefined,
      observedAt: '2026-10-01T00:00:00Z',
    };
    const agedLedger = { ...emptyLedger(), observations: [aged] };
    clearRecoveredLimits({ accounts: [], active: [], ledger: agedLedger, now });
    expect(aged.clearedAt).toBe(now.toISOString());
  });
  it('validates units, non-credential import fields and bounded settings', () => {
    expect(() =>
      manualUsage({ ...observed('claude_mira', 12), units: 'tokens' })
    ).toThrow('manual-usage-invalid');
    expect(() =>
      validateUsageImport({
        provenance: 'fixture',
        settings: {
          providerInstances: {
            x: { driver: 'claudeAgent', config: { auth: 'not-a-secret' } },
          },
        },
      })
    ).toThrow('usage-import-settings-not-narrow');
    expect(() => validatePoolSettings({})).toThrow('pool-settings-invalid');
  });
  it('latches near depletion until the hysteresis threshold and applies pacing/shared concurrency', () => {
    const a = applyManualUsage(
      [account('claude_mira')],
      [observed('claude_mira', 9)]
    )[0]!;
    const ctx = {
      accounts: [a],
      active: [],
      ledger: emptyLedger(),
      now,
      poolSettings: {
        claude_mira: {
          reservePercent: 5,
          nearUsedPercent: 90,
          hysteresisPercent: 5,
          pacingMs: 1000,
          maxConcurrent: 2,
          preference: 4,
        },
      },
    };
    expect(poolPolicyReasons(a, 'claude-opus', 0, ctx)).toContain(
      'pool-near-hysteresis'
    );
    ctx.poolSettings.claude_mira.reservePercent = 0;
    expect(
      poolPolicyReasons(a, 'claude-opus', 0, {
        ...ctx,
        now: new Date(now.getTime() + 16 * 60000),
      })
    ).toContain('pool-near-hysteresis');
    a.windows[0]!.usedPercent = 88;
    expect(poolPolicyReasons(a, 'claude-opus', 0, ctx)).toContain(
      'pool-near-hysteresis'
    );
    a.windows[0]!.usedPercent = 85;
    expect(poolPolicyReasons(a, 'claude-opus', 0, ctx)).toEqual([]);
    ctx.ledger.lastAdmissions = { claude_mira: now.getTime() - 100 };
    expect(poolPolicyReasons(a, 'claude-opus', 2, ctx)).toEqual(
      expect.arrayContaining(['pool-pacing', 'pool-concurrency'])
    );
  });
});
