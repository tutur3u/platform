import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeAccountPacing,
  computeBurnRatePercentPerHour,
  computeGlideFloorPercent,
  computeWindowPacing,
} from '../src/pacing';
import {
  appendPacingSnapshots,
  mergeObservationsIntoHistory,
  readPacingHistory,
} from '../src/pacing-history';
import { recommend } from '../src/policy';
import {
  defaultRoutingConfig,
  evaluateModelPolicy,
  loadRoutingConfig,
  selectAccountModels,
} from '../src/routing-config';
import { formatRecommendTable, formatStatusTable } from '../src/table';
import type { AccountUsage, UsageWindow } from '../src/types';

const temporary: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-quota-pacing-'));
  temporary.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const now = new Date('2026-11-23T03:00:00.000Z');

describe('pacing math and glide floor', () => {
  it('computes 3% + 4%/hr glide floor for session windows and scales for long windows', () => {
    expect(
      computeGlideFloorPercent(
        {
          kind: 'short',
          providerWindowKind: 'session',
          windowDurationMins: 300,
        },
        5
      )
    ).toBe(23);
    expect(
      computeGlideFloorPercent(
        {
          kind: 'short',
          providerWindowKind: 'session',
          windowDurationMins: 300,
        },
        2
      )
    ).toBe(11);
    expect(
      computeGlideFloorPercent(
        {
          kind: 'short',
          providerWindowKind: 'session',
          windowDurationMins: 300,
        },
        0
      )
    ).toBe(3);
    expect(
      computeGlideFloorPercent(
        {
          kind: 'long',
          providerWindowKind: 'weekly',
          windowDurationMins: 10080,
        },
        168
      )
    ).toBe(23);
  });

  it('computes burn rate from recent observations in the same reset cycle and projects exhaustion', () => {
    const window: UsageWindow = {
      id: 'five_hour',
      kind: 'short',
      providerWindowKind: 'session',
      windowDurationMins: 300,
      usedPercent: 40,
      resetsAt: '2026-11-23T07:00:00.000Z',
      observedAt: now.toISOString(),
      authoritative: true,
      source: 'fixture',
    };
    const history = [
      {
        observedAt: '2026-11-23T01:00:00.000Z',
        usedPercent: 80,
        resetsAt: '2026-11-23T02:00:00.000Z', // prior reset cycle -> ignored
      },
      {
        observedAt: '2026-11-23T02:00:00.000Z',
        usedPercent: 10,
        resetsAt: '2026-11-23T07:00:00.000Z',
      },
      {
        observedAt: '2026-11-23T03:00:00.000Z',
        usedPercent: 40,
        resetsAt: '2026-11-23T07:00:00.000Z',
      },
    ];
    const burn = computeBurnRatePercentPerHour(history, window, now);
    expect(burn).toEqual({ burnRatePercentPerHour: 30, observationCount: 2 });

    const pacing = computeWindowPacing(window, history, now, 15 * 60_000);
    expect(pacing.remainingPercent).toBe(60);
    expect(pacing.hoursToReset).toBe(4);
    expect(pacing.glideFloorPercent).toBe(19); // 3 + 4*4
    expect(pacing.burnRatePercentPerHour).toBe(30);
    expect(pacing.projectedExhaustionAt).toBe('2026-11-23T05:00:00.000Z'); // 60% / 30%/h = 2h
    expect(pacing.projectedExhaustionBeforeReset).toBe(true); // 05:00 < 07:00
    expect(pacing.safeToAdmit).toBe(false);
    expect(pacing.reasons).toContain('projected-exhaustion-before-reset');
  });

  it('keeps burn rate null when fewer than two observations exist and computes safe lanes when healthy', () => {
    const account: AccountUsage = {
      instanceId: 'claude_dd',
      provider: 'claude',
      label: 'soc',
      available: true,
      models: ['claude-opus-5-5'],
      windows: [
        {
          id: 'five_hour',
          kind: 'short',
          providerWindowKind: 'session',
          windowDurationMins: 300,
          usedPercent: 10,
          resetsAt: '2026-11-23T07:00:00.000Z', // 4h -> floor 19%, rem 90%, headroom 71%
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    const pacing = computeAccountPacing(
      account,
      1,
      undefined,
      {},
      now,
      15 * 60_000
    );
    expect(pacing.burnRatePercentPerHour).toBeNull();
    expect(pacing.safeToAdmit).toBe(true);
    expect(pacing.recommendedMaxConcurrentLanes).toBe(4);
    expect(pacing.remainingSafeLanes).toBe(3);

    const capped = computeAccountPacing(
      account,
      1,
      { maxConcurrent: 2 },
      {},
      now,
      15 * 60_000
    );
    expect(capped.recommendedMaxConcurrentLanes).toBe(2);
    expect(capped.remainingSafeLanes).toBe(1);
  });

  it('persists and merges pacing observation history safely', async () => {
    const dir = await tempDir();
    const historyFile = join(dir, 'pacing-history.json');
    const account: AccountUsage = {
      instanceId: 'claude_dd',
      provider: 'claude',
      label: 'soc',
      windows: [
        {
          id: 'five_hour',
          kind: 'short',
          usedPercent: 12,
          resetsAt: '2026-11-23T07:00:00.000Z',
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    await appendPacingSnapshots([account], now, historyFile);
    const loaded = await readPacingHistory(historyFile);
    expect(loaded.samples.claude_dd?.five_hour).toHaveLength(1);
    const merged = mergeObservationsIntoHistory(loaded, [
      {
        pool: 'claude_dd',
        measure: 'remaining',
        units: 'percent',
        value: 95,
        observedAt: '2026-11-23T02:30:00.000Z',
        resetAt: '2026-11-23T07:00:00.000Z',
        windowId: 'five_hour',
        windowLabel: 'Session',
        provenance: 'test',
        confidence: 'manual',
      },
    ]);
    expect(merged.claude_dd?.five_hour).toHaveLength(2);
  });
});

describe('user routing preferences config and table rendering', () => {
  it('enforces Gemini Hydrogen > Neon > 3.8 Flash priority and bans Argon', () => {
    const cfg = defaultRoutingConfig();
    const ag: AccountUsage = {
      instanceId: 'antigravity',
      provider: 'antigravity',
      label: 'Antigravity',
      available: true,
      models: [
        'gemini-4-argon',
        'gemini-3.8-flash',
        'gemini-4-neon',
        'gemini-4-hydrogen',
      ],
      windows: [
        {
          id: 'gemini-weekly',
          kind: 'long',
          providerWindowKind: 'weekly',
          windowDurationMins: 10080,
          scope: { kind: 'models', modelPrefixes: ['gemini-'] },
          usedPercent: 10,
          resetsAt: '2026-11-29T05:48:59.000Z',
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    const selection = selectAccountModels(ag, { kind: 'research' }, cfg);
    expect(selection.eligibleModels).toEqual([
      'gemini-4-hydrogen',
      'gemini-4-neon',
      'gemini-3.8-flash',
    ]);
    expect(selection.excludedModels).toEqual([
      { model: 'gemini-4-argon', reason: 'model-forbidden-by-policy' },
    ]);
    const argonDecision = evaluateModelPolicy(
      'antigravity',
      'gemini-4-argon',
      {},
      cfg
    );
    expect(argonDecision.allowed).toBe(false);
    expect(argonDecision.neverUse).toBe(true);
  });

  it('requires explicit approval for Claude Fable and prefers Claude Opus for design/ui work', () => {
    const claudeHealthy: AccountUsage = {
      instanceId: 'claude_dd',
      provider: 'claude',
      label: 'soc',
      available: true,
      models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2'],
      windows: [
        {
          id: 'seven_day',
          kind: 'long',
          providerWindowKind: 'weekly',
          windowDurationMins: 10080,
          usedPercent: 20,
          resetsAt: '2026-11-27T19:00:00.000Z',
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    const codexHealthy: AccountUsage = {
      instanceId: 'codex',
      provider: 'codex',
      label: 'skora',
      available: true,
      models: ['gpt-6.2-sol'],
      windows: [
        {
          id: 'primary',
          kind: 'long',
          providerWindowKind: 'weekly',
          windowDurationMins: 10080,
          usedPercent: 20,
          resetsAt: '2026-11-28T10:00:00.000Z',
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    expect(
      evaluateModelPolicy('claude', 'claude-fable-5-2', { allowFable: false })
        .allowed
    ).toBe(false);
    expect(
      evaluateModelPolicy('claude', 'claude-fable-5-2', { allowFable: true })
        .allowed
    ).toBe(true);

    const designRec = recommend({
      accounts: [codexHealthy, claudeHealthy],
      active: [],
      task: { kind: 'design' },
      now,
    });
    expect(designRec.selected[0]?.instanceId).toBe('claude_dd');
    expect(designRec.selected[0]?.recommendedModel).toBe('claude-opus-5-5');
  });

  it('loads custom routing config overrides from AGENT_QUOTA_ROUTING_CONFIG and renders compact tables', async () => {
    const dir = await tempDir();
    const cfgPath = join(dir, 'custom-routing.json');
    const base = defaultRoutingConfig();
    await writeFile(
      cfgPath,
      JSON.stringify({
        ...base,
        pacing: { ...base.pacing, baseReservePercent: 5 },
      })
    );
    const loaded = loadRoutingConfig(cfgPath);
    expect(loaded.pacing.baseReservePercent).toBe(5);

    const statusText = formatStatusTable([
      {
        instanceId: 'claude_dd',
        label: 'soc',
        provider: 'claude',
        state: 'healthy',
        activeCount: 1,
        windows: [],
        pacing: {
          tightestRemainingPercent: 42,
          soonestResetAt: '2026-11-23T07:00:00.000Z',
          soonestMsToReset: 4 * 3_600_000,
          effectiveGlideFloorPercent: 19,
          headroomAboveFloorPercent: 23,
          burnRatePercentPerHour: 2.5,
          projectedExhaustionAt: '2026-11-23T20:00:00.000Z',
          projectedExhaustionBeforeReset: false,
          safeToAdmit: true,
          recommendedMaxConcurrentLanes: 2,
          remainingSafeLanes: 1,
          reasons: [],
          windows: [],
        },
      },
    ]);
    expect(statusText).toContain('claude_dd(soc)');
    expect(statusText).toContain('2.5%/h');
    expect(statusText).toContain('1/2');

    const recText = formatRecommendTable([], [], 'design');
    expect(recText).toContain('Task kind: design');
  });
});
