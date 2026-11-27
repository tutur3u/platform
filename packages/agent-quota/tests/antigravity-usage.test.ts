import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseAntigravityUsage } from '../src/antigravity-usage';
import { capacityLine } from '../src/capacity-line';
import { computeWindowPacing } from '../src/pacing';
import { recommend } from '../src/policy';
import { freshRemainingPercent } from '../src/watch';
import { snapshotWindows } from '../src/usage-import';
import { coversModel } from '../src/window-scope';

const tsv = readFileSync(
  new URL('./fixtures/antigravity-usage.tsv', import.meta.url),
  'utf8'
);

test('retains both pools and windows without treating the epoch as a reset', () => {
  const checkedAt = '2026-11-27T12:00:00Z';
  const account = {
    instanceId: 'antigravity_2',
    label: 'Antigravity',
    provider: 'antigravity' as const,
    windows: [],
  };
  const windows = snapshotWindows(account, {
    checkedAt,
    windows: parseAntigravityUsage(tsv),
  });
  expect(
    windows.map(({ id, usedPercent, resetsAt }) => [id, usedPercent, resetsAt])
  ).toEqual([
    ['gemini-weekly', 19, '2026-12-03T16:48:23.000Z'],
    ['gemini-5h', 100, '2026-11-27T13:30:00.000Z'],
    ['3p-weekly', 0, '1970-01-01T00:00:00.000Z'],
    ['3p-5h', 0, '1970-01-01T00:00:00.000Z'],
  ]);
  expect(
    windows
      .filter((window) => coversModel(window, 'gemini-4-argon'))
      .map(({ id }) => id)
  ).toEqual(['gemini-weekly', 'gemini-5h']);
  expect(
    windows
      .filter((window) => coversModel(window, 'claude-opus-5-5'))
      .map(({ id }) => id)
  ).toEqual(['3p-weekly', '3p-5h']);
  const now = new Date(checkedAt);
  expect(freshRemainingPercent(windows, now, 300_000, 'claude-opus-5-5')).toBe(
    100
  );
  expect(computeWindowPacing(windows[2]!, [], now, 300_000)).toMatchObject({
    safeToAdmit: true,
    resetsAt: null,
  });
  expect(capacityLine([{ ...account, windows }], now)).toBe(
    'antigravity_2/gemini 5h=0% week=81% | antigravity_2/claude-gpt 5h=100% week=100%'
  );
  const [weekly, session, ...thirdParty] = windows;
  const mixed = [
    weekly!,
    { ...weekly!, id: 'gemini-argon-wtu-weekly', usedPercent: 100 },
    { ...session!, resetsAt: '2026-11-27T11:59:00Z' },
    ...thirdParty,
  ];
  expect(capacityLine([{ ...account, windows: mixed }], now)).toBe(
    'antigravity_2/gemini 5h=unknown week=81% | antigravity_2/claude-gpt 5h=100% week=100%'
  );
});

test('rejects incomplete, malformed and duplicate windows', () => {
  expect(() => parseAntigravityUsage(tsv.split('\n')[0]!)).toThrow(
    'incomplete'
  );
  expect(() => parseAntigravityUsage(tsv.replace('81%', '101%'))).toThrow(
    'invalid-row'
  );
  expect(() =>
    parseAntigravityUsage(tsv.replace('\treset 2026-12-03T16:48:23Z', ''))
  ).toThrow('invalid-row');
  expect(() =>
    parseAntigravityUsage(
      tsv.replace('reset 2026-11-27T13:30:00Z', '1970-01-01T00:00:00Z')
    )
  ).toThrow('invalid-row');
  expect(() => parseAntigravityUsage(tsv + tsv)).toThrow('duplicate-window');
});

test('uses actual reset deadlines and preserves provider idle sessions', () => {
  const checkedAt = '2026-11-27T12:00:00Z';
  const now = new Date(checkedAt);
  const account = {
    instanceId: 'antigravity_2',
    label: 'Antigravity',
    provider: 'antigravity' as const,
    models: ['claude-opus-5-5'],
    available: true,
    windows: [],
  };
  const limits = parseAntigravityUsage(tsv).map((window) => {
    if (window.id === '3p-weekly') {
      return { ...window, resetsAt: '2026-11-27T12:10:00Z' };
    }
    if (window.id === '3p-5h') {
      return { ...window, resetsAt: '1970-01-01T00:00:00Z' };
    }
    return window;
  });
  const windows = snapshotWindows(account, { checkedAt, windows: limits });
  const result = recommend({
    accounts: [{ ...account, windows }],
    active: [],
    task: { model: 'claude-opus-5-5' },
    now,
  });
  const reasons = result.ranked[0]?.reasons.map((reason) => reason.code);
  expect(reasons).toContain('reset-soon');
  expect(reasons).not.toContain('reset-expired');

  const idle = {
    kind: 'short' as const,
    providerWindowKind: 'session' as const,
    usedPercent: 0,
    observedAt: checkedAt,
    source: 'provider',
    authoritative: true,
  };
  expect(freshRemainingPercent([idle], now, 300_000)).toBe(100);
  expect(
    capacityLine(
      [
        {
          instanceId: 'claudeAgent',
          label: 'Claude',
          provider: 'claude',
          windows: [idle],
        },
      ],
      now
    )
  ).toBe('claudeAgent 5h=100% week=unknown');
});

test('keeps exhausted weekly readings when short windows are absent or disabled', () => {
  const reset = '2026-12-04T15:17:53Z';
  const rows = [
    ['Gemini Models', 'Weekly Limit Remaining', '0%', reset],
    ['Claude and GPT models', 'Weekly Limit Remaining', '0%', reset],
    ['Claude and GPT models', 'Five Hour Limit Remaining', 'disabled', ''],
  ];
  expect(
    parseAntigravityUsage(rows.map((row) => row.join('\t')).join('\n')).map(
      ({ id, usedPercent }) => [id, usedPercent]
    )
  ).toEqual([
    ['gemini-weekly', 100],
    ['3p-weekly', 100],
  ]);
});
