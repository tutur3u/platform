import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectAntigravity } from '../src/collectors/antigravity';
import { parseCatalog } from '../src/collectors/catalog';
import { collectSnapshot } from '../src/collectors/snapshot';
import { recommend, SIGNAL_TTL_MS } from '../src/policy';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T00:00:00Z');
const healthy = (instanceId: string, label = instanceId): AccountUsage => ({
  instanceId,
  label,
  provider: 'codex',
  windows: [
    {
      kind: 'short',
      usedPercent: 30,
      resetsAt: '2026-10-23T01:00:00Z',
      observedAt: now.toISOString(),
      authoritative: true,
      source: 'fixture',
    },
  ],
});
const rank = (
  accounts: AccountUsage[],
  active: { instanceId: string; count: number }[] = []
) => recommend({ accounts, active, task: { kind: 'review' }, now });
describe('freshness, identity and reservations', () => {
  it('makes stale data UNKNOWN and reports its age and provider TTL', () => {
    const account = healthy('old');
    first(account.windows).observedAt = new Date(
      now.getTime() - SIGNAL_TTL_MS.codex - 1
    ).toISOString();
    const result = rank([account]);
    expect(result.selected).toEqual([]);
    expect(result.ranked[0]).toMatchObject({
      state: 'UNKNOWN',
      ageMs: SIGNAL_TTL_MS.codex + 1,
      ttlMs: SIGNAL_TTL_MS.codex,
    });
  });
  it('subtracts active reservations and still ranks known healthy before unknown', () => {
    const unknown = { ...healthy('unknown'), windows: [] };
    const result = rank(
      [healthy('busy'), healthy('free'), unknown],
      [{ instanceId: 'busy', count: 8 }]
    );
    expect(result.ranked.map((item) => item.instanceId)).toEqual([
      'free',
      'busy',
      'unknown',
    ]);
    expect(result.ranked[1]?.score).toBeLessThan(first(result.ranked).score);
    expect(result.ranked[1]?.activeCount).toBe(8);
  });
  it('keys crossed and duplicated display names by instance ID', () => {
    const result = rank(
      [
        healthy('claude_mira', 'kv'),
        healthy('claude_kv', 'mira'),
        healthy('claude_hehe', 'skora'),
        healthy('codex', 'skora'),
      ],
      [{ instanceId: 'codex', count: 1 }]
    );
    expect(result.ranked).toHaveLength(4);
    expect(
      result.ranked.find((item) => item.instanceId === 'claude_hehe')
        ?.activeCount
    ).toBe(0);
    expect(
      result.ranked.every((item) =>
        item.reasons.some((reason) => reason.code === 'alias')
      )
    ).toBe(true);
  });
  it('collapses same-provider account hashes and combines reserved load', () => {
    const accounts = [healthy('a'), healthy('b')].map((account) => ({
      ...account,
      accountIdentityHash: 'a'.repeat(64),
    }));
    const result = rank(accounts, [
      { instanceId: 'a', count: 1 },
      { instanceId: 'b', count: 2 },
    ]);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]).toMatchObject({
      instanceIds: ['a', 'b'],
      activeCount: 3,
    });
  });
  it('selects a usable matching-model alias without losing combined reservations', () => {
    const a = {
      ...healthy('a'),
      available: false,
      accountIdentityHash: 'f'.repeat(64),
    };
    const b = {
      ...healthy('b'),
      available: true,
      models: ['review-model'],
      accountIdentityHash: 'f'.repeat(64),
    };
    const result = recommend({
      accounts: [a, b],
      active: [{ instanceId: 'a', count: 1 }],
      task: { model: 'review-model' },
      now,
    });
    expect(result.selected[0]).toMatchObject({
      instanceId: 'b',
      activeCount: 1,
    });
  });

  it('does not fabricate Antigravity headroom without a usage signal', () => {
    const result = rank([collectAntigravity()]);
    expect(result.selected).toEqual([]);
    expect(result.ranked[0]).toMatchObject({
      state: 'UNKNOWN',
      eligible: false,
      ageMs: null,
    });
    expect(result.ranked[0]?.reasons.map((reason) => reason.code)).toContain(
      'no-usage-signal'
    );
  });
  it('drains near and exhausted pools at the boundary', () => {
    for (const usedPercent of [90, 100]) {
      const account = healthy('limited');
      first(account.windows).usedPercent = usedPercent;
      expect(rank([account]).ranked[0]).toMatchObject({
        eligible: false,
        action: 'drain',
        state: usedPercent === 100 ? 'exhausted' : 'near',
      });
    }
  });
  it('rejects missing resets, non-authoritative values and invalid percentages', () => {
    for (const patch of [
      { resetsAt: undefined },
      { authoritative: false },
      { usedPercent: NaN },
      { usedPercent: -1 },
    ]) {
      const account = healthy('invalid');
      Object.assign(first(account.windows), patch);
      expect(rank([account]).ranked[0]?.state).toBe('UNKNOWN');
    }
  });
  it('discovers models and crossed names from the catalog', () => {
    const result = parseCatalog({
      providers: [
        {
          driverKind: 'antigravity',
          providerInstanceId: 'antigravity',
          displayName: 'AG',
          canRunChildTask: true,
          models: [
            {
              id: 'future-gemini',
              options: [null, { id: 'effort', values: ['high', false, 3] }],
            },
          ],
        },
      ],
    });
    expect(result[0]).toMatchObject({
      provider: 'antigravity',
      models: ['future-gemini'],
      modelOptions: {
        'future-gemini': [{ id: 'effort', values: ['high', false] }],
      },
    });
  });
  it('reads only matching provider status snapshots and retains observation time', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quota-status-'));
    try {
      const account = collectAntigravity();
      expect((await collectSnapshot(account, directory)).windows).toEqual([]);
      const snapshot = {
        instanceId: 'antigravity',
        driver: 'antigravity',
        usageLimits: {
          checkedAt: now.toISOString(),
          credentialFingerprint: 'a'.repeat(64),
          windows: [
            {
              kind: 'weekly',
              usedPercent: 25,
              resetsAt: '2026-10-23T01:00:00Z',
            },
          ],
        },
      };
      await writeFile(
        join(directory, 'antigravity.json'),
        JSON.stringify(snapshot)
      );
      const result = await collectSnapshot(account, directory);
      expect(result.windows[0]).toMatchObject({
        usedPercent: 25,
        observedAt: now.toISOString(),
        kind: 'long',
      });
      // An Antigravity window without scope cannot establish model headroom.
      expect(rank([result]).ranked[0]?.state).toBe('UNKNOWN');
      await writeFile(
        join(directory, 'antigravity.json'),
        JSON.stringify({
          ...snapshot,
          usageLimits: {
            ...snapshot.usageLimits,
            unavailable: { reason: 'probeFailed' },
          },
        })
      );
      expect(
        rank([await collectSnapshot(account, directory)]).ranked[0]?.state
      ).toBe('UNKNOWN');

      await writeFile(
        join(directory, 'antigravity.json'),
        JSON.stringify({ ...snapshot, instanceId: 'wrong' })
      );
      expect((await collectSnapshot(account, directory)).windows).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function first<T>(items: T[]): T {
  const item = items[0];
  if (!item) throw new Error('Missing fixture item');
  return item;
}
