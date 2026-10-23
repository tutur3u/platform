import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collapseAccounts } from '../src/accounts';
import { recommend } from '../src/policy';
import type { AccountUsage } from '../src/types';
import { applyImportedUsage, snapshotWindows } from '../src/usage-import';
import { windowObservationIsFresh } from '../src/window-freshness';
import { coversModel } from '../src/window-scope';

const registry = JSON.parse(
  readFileSync(
    new URL('./fixtures/live-usage-registry-r1.json', import.meta.url),
    'utf8'
  )
) as Record<string, unknown>;
const now = new Date('2026-10-23T20:34:00.000Z');
const instances = [
  'codex_ai4ed',
  'codex',
  'claudeAgent',
  'claude_mira',
  'claude_kv',
  'claude_hehe',
  'claude_dd',
  'antigravity',
];
const accounts: AccountUsage[] = instances.map((instanceId) => ({
  instanceId,
  provider: instanceId.startsWith('codex')
    ? 'codex'
    : instanceId === 'antigravity'
      ? 'antigravity'
      : 'claude',
  label: instanceId,
  models:
    instanceId === 'antigravity'
      ? ['gemini-4-argon-high', 'gemini-3.8-flash-low']
      : instanceId.startsWith('codex')
        ? ['gpt-6.1-sol']
        : ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'],
  available: true,
  windows: [],
}));

describe('passive T3 Usage registry parity import', () => {
  it('preserves catalog identity, usage kind, label, duration, reset and percent sense', () => {
    const result = applyImportedUsage(accounts, registry);
    const byId = new Map(
      result.map((account) => [account.instanceId, account])
    );
    const expectedRemaining = new Map([
      ['claudeAgent', [12, 70]],
      ['claude_mira', [38, 100]],
      ['claude_kv', [0, 98]],
      ['claude_hehe', [0, 94]],
      ['claude_dd', [94, 100]],
      ['codex_ai4ed', [95]],
      ['codex', [0]],
      ['antigravity', [100, 100]],
    ]);
    for (const [instanceId, values] of expectedRemaining) {
      const windows = byId.get(instanceId)?.windows ?? [];
      expect(windows.map((window) => 100 - (window.usedPercent ?? 0))).toEqual(
        values
      );
      expect(windows.every((window) => window.observedAt)).toBe(true);
      expect(windows.every((window) => window.freshnessTtlMs === 300_000)).toBe(
        true
      );
    }
    expect(byId.get('claudeAgent')?.windows[1]).toMatchObject({
      id: 'seven_day_fable',
      label: 'Weekly · Fable',
      providerWindowKind: 'weekly',
      windowDurationMins: 10_080,
      scope: { kind: 'models', modelFamilies: ['fable'] },
    });
    expect(byId.get('codex')?.windows[0]).toMatchObject({
      providerWindowKind: 'monthly',
      windowDurationMins: 43_200,
      resetsAt: '2026-11-19T07:28:47.000Z',
    });
    expect(byId.get('antigravity')?.windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '3p-5h',
          scope: { kind: 'models', modelPrefixes: ['claude-', 'gpt-'] },
        }),
        expect.objectContaining({
          id: '3p-weekly',
          scope: { kind: 'models', modelPrefixes: ['claude-', 'gpt-'] },
        }),
      ])
    );
    expect(
      byId
        .get('antigravity')
        ?.windows.some(
          (window) =>
            window.scope?.kind === 'models' &&
            window.scope.modelPrefixes?.some((prefix) => prefix === 'gemini')
        )
    ).toBe(false);
    expect(
      byId
        .get('antigravity')!
        .windows.every((window) => !coversModel(window, 'gemini-4-argon-high'))
    ).toBe(true);
  });

  it('uses checkedAt freshness and keeps stale snapshots UNKNOWN', () => {
    const result = applyImportedUsage(accounts, registry);
    const owner = result.find(
      (account) => account.instanceId === 'claudeAgent'
    );
    const session = owner?.windows.find((window) => window.id === 'five_hour');
    expect(session?.observedAt).toBe('2026-10-23T20:28:01.942Z');
    expect(windowObservationIsFresh(session!, now, 900_000)).toBe(false);
    const ranking = recommend({
      accounts: [owner!],
      active: [],
      task: { kind: 'implementation', model: 'claude-opus-5-5' },
      now,
    });
    expect(ranking.ranked[0]).toMatchObject({
      state: 'UNKNOWN',
      eligible: false,
      ttlMs: 300_000,
    });
  });

  it('does not invent identity or merge mutable aliases when the bridge omits identity', () => {
    const result = applyImportedUsage(accounts, registry);
    expect(result.every((account) => !account.accountIdentityHash)).toBe(true);
    expect(collapseAccounts(result)).toHaveLength(8);
    const sharedIdentity = 'b'.repeat(64);
    const base = result.find(
      (account) => account.instanceId === 'claudeAgent'
    )!;
    const aliases = [
      { ...base, accountIdentityHash: sharedIdentity },
      {
        ...base,
        instanceId: 'claude-alias',
        accountIdentityHash: sharedIdentity,
      },
    ];
    expect(collapseAccounts(aliases)).toHaveLength(1);
    expect(collapseAccounts(aliases)[0]?.instanceIds).toEqual([
      'claude-alias',
      'claudeAgent',
    ]);
  });

  it('treats missing telemetry and unknown window kinds as UNKNOWN', () => {
    const noTelemetry = snapshotWindows(accounts[0]!, undefined);
    const staleCache: AccountUsage = {
      ...accounts[0]!,
      windows: [
        {
          id: 'primary',
          kind: 'long',
          usedPercent: 0,
          source: 'secondary cache fixture',
          observedAt: '2026-10-23T20:33:00.000Z',
          resetsAt: '2026-10-30T20:33:00.000Z',
          authoritative: true,
        },
      ],
    };
    const missingRegistrySignal = applyImportedUsage([staleCache], {
      provenance: 'sanitized missing telemetry fixture',
      providers: [{ instanceId: 'codex_ai4ed', driver: 'codex' }],
    });
    const unknownKind = snapshotWindows(accounts[0]!, {
      checkedAt: now.toISOString(),
      windows: [
        {
          id: 'future-kind',
          kind: 'provider-added-kind',
          label: 'Monthly',
          usedPercent: 0,
          resetsAt: '2026-11-23T20:34:00Z',
          windowDurationMins: 43_200,
        },
      ],
    });
    expect(noTelemetry).toEqual([]);
    expect(missingRegistrySignal[0]?.windows).toHaveLength(1);
    expect(missingRegistrySignal[0]?.windows[0]?.freshnessTtlMs).toBe(0);
    expect(unknownKind[0]).toMatchObject({
      usedPercent: 0,
      authoritative: false,
      freshnessTtlMs: 300_000,
    });
  });

  it('keeps unknown-kind account exhaustion binding beside fresh session data', () => {
    const imported = snapshotWindows(accounts[2]!, {
      checkedAt: now.toISOString(),
      windows: [
        {
          id: 'session',
          kind: 'session',
          usedPercent: 10,
          resetsAt: '2026-10-24T00:00:00Z',
        },
        {
          id: 'account-future-kind',
          kind: 'provider-added-kind',
          usedPercent: 100,
          resetsAt: '2026-10-24T00:00:00Z',
        },
      ],
    });
    const ranked = recommend({
      accounts: [{ ...accounts[2]!, windows: imported }],
      active: [],
      task: { model: 'claude-opus-5-5' },
      now,
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
    expect(ranked?.reasons.map((reason) => reason.code)).toContain(
      'near-limit-stale'
    );
  });

  it('blocks a stale unknown-kind exhausted window until its reset', () => {
    const windows = snapshotWindows(accounts[2]!, {
      checkedAt: '2026-10-23T20:00:00.000Z',
      windows: [
        {
          id: 'five_hour',
          kind: 'provider-added-kind',
          usedPercent: 100,
          resetsAt: '2026-10-24T00:00:00Z',
        },
      ],
    });
    const ranked = recommend({
      accounts: [{ ...accounts[2]!, windows }],
      active: [],
      task: { model: 'claude-opus-5-5' },
      now,
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
    expect(ranked?.reasons.map((reason) => reason.code)).toContain(
      'near-limit-stale'
    );
  });

  it('demotes exhausted cache windows instead of deleting them when registry usage is absent', () => {
    const exhausted: AccountUsage = {
      ...accounts[2]!,
      windows: [
        {
          id: 'five_hour',
          kind: 'short',
          usedPercent: 100,
          resetsAt: '2026-10-24T00:00:00Z',
          observedAt: now.toISOString(),
          source: 'sanitized cache fixture',
          authoritative: true,
        },
      ],
    };
    const demoted = applyImportedUsage([exhausted], {
      providers: [
        {
          instanceId: 'claudeAgent',
          driver: 'claudeAgent',
          usageLimits: { unavailable: true },
        },
      ],
    })[0]!;
    expect(demoted.windows).toHaveLength(1);
    expect(demoted.windows[0]?.freshnessTtlMs).toBe(0);
    const ranked = recommend({
      accounts: [demoted],
      active: [],
      task: { model: 'claude-opus-5-5' },
      now,
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
    expect(ranked?.reasons.map((reason) => reason.code)).toContain(
      'near-limit-stale'
    );
  });

  it('keeps a fresh zero-used Antigravity third-party window UNKNOWN for Gemini', () => {
    const antigravity = accounts.find(
      (item) => item.instanceId === 'antigravity'
    )!;
    const windows = snapshotWindows(antigravity, {
      checkedAt: now.toISOString(),
      windows: [
        {
          id: '3p-5h',
          kind: 'session',
          usedPercent: 0,
          resetsAt: '2026-10-23T21:00:00Z',
        },
      ],
    });
    const ranked = recommend({
      accounts: [{ ...antigravity, windows }],
      active: [],
      task: { model: 'gemini-4-argon-high' },
      now,
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
    expect(ranked?.signalOrderRemainingPercent).toBeNull();
  });

  it('does not use fresh Fable-only remaining as Opus headroom', () => {
    const fable = snapshotWindows(accounts[2]!, {
      checkedAt: now.toISOString(),
      windows: [
        {
          id: 'seven_day_fable',
          kind: 'weekly',
          label: 'Weekly · Fable',
          usedPercent: 5,
          resetsAt: '2026-10-30T20:34:00Z',
        },
      ],
    });
    const ranked = recommend({
      accounts: [{ ...accounts[2]!, windows: fable }],
      active: [],
      task: { model: 'claude-opus-5-5' },
      now,
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
  });
});
