// The publisher's fleet account rule is a dependency-free module, so the
// freshness rules it restates are pinned to this package here.
import { describe, expect, it } from 'vitest';
// @ts-expect-error untyped publisher module
import * as input from '../../../scripts/mastermind-fleet/fleet-account-input.mjs';
// @ts-expect-error untyped publisher module
import * as rule from '../../../scripts/mastermind-fleet/fleet-account-merge.mjs';
import { driverToProvider } from '../src/collectors/provider';
import { SIGNAL_TTL_MS } from '../src/policy';
import type { Provider, UsageWindow } from '../src/types';
import {
  PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS,
  windowFreshnessTtlMs,
  windowHasCurrentReset,
  windowObservationIsFresh,
} from '../src/window-freshness';

const now = new Date('2026-11-28T04:20:00.000Z');
const at = (offsetMs: number) =>
  new Date(now.getTime() + offsetMs).toISOString();

describe('fleet publisher parity', () => {
  it('ages T3 readings like this package does for every provider', () => {
    for (const ttl of Object.values(SIGNAL_TTL_MS))
      expect(
        windowFreshnessTtlMs(
          { freshnessTtlMs: PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS },
          ttl
        )
      ).toBe(rule.FLEET_READING_MAX_AGE_MS);
  });

  it('agrees on eligibility with no future skew', () => {
    let eligible = 0;
    let total = 0;
    for (const provider of Object.keys(SIGNAL_TTL_MS) as Provider[])
      for (const age of [-60_000, -1, 0, 60_000, 300_000, 300_001])
        for (const usedPercent of [0, 50, 100])
          for (const kind of ['session', 'weekly'] as const)
            for (const id of ['five_hour', 'gemini-5h'])
              for (const authoritative of [true, false])
                for (const resetsAt of [
                  at(3_600_000),
                  at(0),
                  at(-1),
                  undefined,
                  '',
                  '1970-01-01T00:00:00Z',
                ]) {
                  const window: UsageWindow = {
                    id,
                    kind: 'short',
                    providerWindowKind: kind,
                    confidence: 'provider',
                    freshnessTtlMs: PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS,
                    usedPercent,
                    resetsAt,
                    source: 'fixture',
                    observedAt: at(-age),
                    authoritative,
                  };
                  const expected =
                    authoritative &&
                    windowHasCurrentReset(window, now) &&
                    windowObservationIsFresh(
                      window,
                      now,
                      SIGNAL_TTL_MS[provider],
                      0
                    );
                  const actual = rule.readingIsEligible(
                    {
                      windowId: id,
                      kind,
                      usedPercent,
                      resetsAt,
                      observedAt: window.observedAt,
                      authoritative,
                    },
                    now
                  );
                  expect(actual, JSON.stringify(window)).toBe(expected);
                  total += 1;
                  if (actual) eligible += 1;
                }
    // Guards against a matrix that only ever exercises one outcome.
    expect(eligible).toBeGreaterThan(0);
    expect(eligible).toBeLessThan(total);
  });

  it('names providers like the collectors do', () => {
    for (const [driver, instanceId] of [
      ['claudeAgent', 'claude_1'],
      ['claude', 'claude_1'],
      ['codex', 'codex'],
      ['antigravity', 'antigravity'],
      ['grok', 'grok'],
      ['cursor', 'cursor'],
      ['opencode', 'opencode'],
      ['copilot', 'copilot'],
      ['acpRegistry', 'acpRegistry_github_copilot'],
      ['acpRegistry_github_copilot', 'x'],
    ] as const)
      expect(input.fleetProvider(driver, instanceId)).toBe(
        driverToProvider(driver, instanceId)
      );
  });
});
