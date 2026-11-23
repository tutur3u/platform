import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSnapshot } from '../src/collectors/snapshot';
import { recommend } from '../src/policy';
import type { AccountUsage } from '../src/types';
import { coversModel, windowScope } from '../src/window-scope';

const temporary: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-quota-parsers-'));
  temporary.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const now = new Date('2026-11-23T03:05:00.000Z');
const futureReset = '2026-11-26T03:52:28.283Z';

describe('full provider parsers and discovery', () => {
  it('parses Grok weekly window and exhausted balance/credits telemetry', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'grok.json'),
      JSON.stringify({
        instanceId: 'grok',
        driver: 'grok',
        status: 'ready',
        enabled: true,
        checkedAt: now.toISOString(),
        models: [{ slug: 'grok-4.7' }, { slug: 'grok-4.6' }],
        usageLimits: {
          checkedAt: now.toISOString(),
          balance: { remaining: 0, total: 20, currency: 'USD' },
          windows: [
            {
              id: 'subscription',
              kind: 'weekly',
              label: 'Weekly',
              usedPercent: 40,
              resetsAt: futureReset,
              windowDurationMins: 10080,
            },
          ],
        },
      })
    );
    const base: AccountUsage = {
      instanceId: 'grok',
      provider: 'grok',
      label: 'Grok',
      windows: [],
      available: true,
    };
    const account = await collectSnapshot(base, dir);
    expect(account.balance).toMatchObject({
      remaining: 0,
      total: 20,
      currency: 'USD',
      exhausted: true,
    });
    expect(account.models).toEqual(['grok-4.7', 'grok-4.6']);
    const ranked = recommend({
      accounts: [account],
      active: [],
      task: { provider: 'grok' },
      now,
    }).ranked[0]!;
    expect(ranked.state).toBe('exhausted');
    expect(ranked.eligible).toBe(false);
    expect(ranked.reasons.map((r) => r.code)).toContain('balance-exhausted');
  });

  it('parses Cursor autoPercentUsed vs totalPercentUsed and keeps missing limits UNKNOWN', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'cursor.json'),
      JSON.stringify({
        instanceId: 'cursor',
        driver: 'cursor',
        status: 'ready',
        enabled: true,
        models: [
          { slug: 'default' },
          { slug: 'composer-2.5' },
          { slug: 'claude-opus-5-5' },
        ],
        usageLimits: {
          checkedAt: now.toISOString(),
          windows: [
            {
              id: 'autoPercentUsed',
              kind: 'monthly',
              label: 'Cursor Models',
              usedPercent: 100,
              resetsAt: futureReset,
              windowDurationMins: 10080,
            },
            {
              id: 'totalPercentUsed',
              kind: 'monthly',
              label: 'Overall',
              usedPercent: 35,
              resetsAt: futureReset,
              windowDurationMins: 10080,
            },
          ],
        },
      })
    );
    const account = await collectSnapshot(
      {
        instanceId: 'cursor',
        provider: 'cursor',
        label: 'Cursor',
        windows: [],
        available: true,
      },
      dir
    );
    const autoWin = account.windows.find((w) => w.id === 'autoPercentUsed')!;
    const totalWin = account.windows.find((w) => w.id === 'totalPercentUsed')!;
    expect(autoWin.authoritative).toBe(true);
    expect(coversModel(autoWin, 'composer-2.5')).toBe(true);
    expect(coversModel(autoWin, 'claude-opus-5-5')).toBe(false);
    expect(coversModel(totalWin, 'claude-opus-5-5')).toBe(true);

    await writeFile(
      join(dir, 'cursor.json'),
      JSON.stringify({
        instanceId: 'cursor',
        driver: 'cursor',
        status: 'error',
        enabled: true,
        message: 'Cursor SDK catalog request failed.',
      })
    );
    const errored = await collectSnapshot(
      {
        instanceId: 'cursor',
        provider: 'cursor',
        label: 'Cursor',
        windows: [],
        available: true,
      },
      dir
    );
    expect(errored.windows).toEqual([]);
    expect(errored.providerStatus).toBe('error');
    expect(errored.lastError).toBe('no-usage-signal');
  });

  it('parses OpenCode Go windows separately from paid Zen models', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'opencode.json'),
      JSON.stringify({
        instanceId: 'opencode',
        driver: 'opencode',
        status: 'ready',
        enabled: true,
        models: [
          { slug: 'opencode-go/kimi-k3.1-pro' },
          { slug: 'opencode/claude-opus-5-5' },
          { slug: 'opencode/beam-free' },
        ],
        usageLimits: {
          checkedAt: now.toISOString(),
          windows: [
            {
              id: 'go_rolling',
              kind: 'session',
              label: 'Go · Session',
              usedPercent: 0,
              resetsAt: '2026-11-23T08:00:00.000Z',
              windowDurationMins: 300,
            },
            {
              id: 'go_weekly',
              kind: 'weekly',
              label: 'Go · Weekly',
              usedPercent: 10,
              resetsAt: '2026-11-30T00:00:00.000Z',
              windowDurationMins: 10080,
            },
            {
              id: 'go_monthly',
              kind: 'monthly',
              label: 'Go · Monthly',
              usedPercent: 100,
              resetsAt: '2026-12-05T09:04:36.000Z',
            },
          ],
        },
      })
    );
    const account = await collectSnapshot(
      {
        instanceId: 'opencode',
        provider: 'opencode',
        label: 'OpenCode',
        windows: [],
        available: true,
      },
      dir
    );
    expect(account.neverUseModels).toEqual(['opencode/claude-opus-5-5']);
    for (const w of account.windows) {
      expect(w.authoritative).toBe(true);
      expect(coversModel(w, 'opencode-go/kimi-k3.1-pro')).toBe(true);
      expect(coversModel(w, 'opencode/claude-opus-5-5')).toBe(false);
    }

    const blockedPaidZen = recommend({
      accounts: [account],
      active: [],
      task: {
        provider: 'opencode',
        model: 'opencode/claude-opus-5-5',
        nonPrivate: true,
      },
      now,
    }).ranked[0]!;
    expect(blockedPaidZen.eligible).toBe(false);
    expect(blockedPaidZen.reasons.map((r) => r.code)).toContain(
      'opencode-paid-zen-forbidden'
    );

    const exhaustedGo = recommend({
      accounts: [account],
      active: [],
      task: {
        provider: 'opencode',
        model: 'opencode-go/kimi-k3.1-pro',
        nonPrivate: true,
      },
      now,
    }).ranked[0]!;
    expect(exhaustedGo.state).toBe('exhausted');
    expect(exhaustedGo.eligible).toBe(false);
  });

  it('scopes Antigravity gemini-argon-wtu-weekly strictly to Argon and keeps Hydrogen covered by gemini-weekly', () => {
    const argonScope = windowScope(
      'antigravity',
      'gemini-argon-wtu-weekly',
      'Gemini 4 Argon · Weekly'
    );
    const geminiScope = windowScope(
      'antigravity',
      'gemini-weekly',
      'Gemini · Weekly'
    );
    expect(
      coversModel(
        { scope: argonScope } as AccountUsage['windows'][number],
        'gemini-4-argon'
      )
    ).toBe(true);
    expect(
      coversModel(
        { scope: argonScope } as AccountUsage['windows'][number],
        'gemini-4-hydrogen'
      )
    ).toBe(false);
    expect(
      coversModel(
        { scope: geminiScope } as AccountUsage['windows'][number],
        'gemini-4-hydrogen'
      )
    ).toBe(true);
  });

  it('treats idle 0% Claude five_hour without resetsAt as fresh when weekly is healthy, and redacts auth errors', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'claude_thanh.json'),
      JSON.stringify({
        instanceId: 'claude_thanh',
        driver: 'claudeAgent',
        status: 'ready',
        enabled: true,
        models: [{ slug: 'claude-opus-5-5' }],
        usageLimits: {
          checkedAt: now.toISOString(),
          windows: [
            {
              id: 'five_hour',
              kind: 'session',
              label: 'Session',
              windowDurationMins: 300,
              usedPercent: 0,
            },
            {
              id: 'seven_day',
              kind: 'weekly',
              label: 'Weekly',
              windowDurationMins: 10080,
              usedPercent: 20,
              resetsAt: futureReset,
            },
          ],
        },
      })
    );
    await writeFile(
      join(dir, 'claude_mira.json'),
      JSON.stringify({
        instanceId: 'claude_mira',
        driver: 'claudeAgent',
        status: 'error',
        enabled: true,
        checkedAt: now.toISOString(),
        message:
          'Claude could not authenticate. CLAUDE_CONFIG_DIR="/Users/secret/path"',
      })
    );

    const thanh = await collectSnapshot(
      {
        instanceId: 'claude_thanh',
        provider: 'claude',
        label: 'thanh',
        windows: [],
        available: true,
      },
      dir
    );
    const mira = await collectSnapshot(
      {
        instanceId: 'claude_mira',
        provider: 'claude',
        label: 'kv',
        windows: [],
        available: false,
      },
      dir
    );
    expect(mira.statusMessage).toBe(
      '[authentication failure receipt withheld]'
    );
    const ranked = recommend({
      accounts: [thanh, mira],
      active: [],
      task: { provider: 'claude' },
      now,
    });
    expect(ranked.ranked[0]?.instanceId).toBe('claude_thanh');
    expect(ranked.ranked[0]?.state).toBe('healthy');
    expect(ranked.ranked[0]?.eligible).toBe(true);
    expect(ranked.ranked[1]?.state).toBe('UNKNOWN');
  });
});
