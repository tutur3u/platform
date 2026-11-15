// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ABUSE_GUARD_FAMILIES } from '../protocol';
import {
  configureAbuseGuardRuntime,
  parseAbuseGuardTimeout,
  selectAbuseGuard,
} from '../select';

afterEach(() => {
  configureAbuseGuardRuntime(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('family timeout selection', () => {
  it.each(ABUSE_GUARD_FAMILIES)(
    'uses a replay-only higher HTTP timeout for %s',
    async (family) => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                v: 1,
                steps: [{ results: [{ op: 'kv.get', v: null }] }],
              })
            )
        )
      );
      const selection = selectAbuseGuard(family, {
        ABUSE_GUARD_FAMILIES: family,
        ABUSE_GUARD_URL: 'https://guard.example.test',
        ABUSE_GUARD_SECRET: 's'.repeat(40),
        ABUSE_GUARD_KEY_PEPPER: 'p'.repeat(40),
      });
      if (selection.kind !== 'durable-object') throw new Error('unconfigured');
      await selection.client.get('key');
      expect(timeout).toHaveBeenLastCalledWith(
        family === 'replay' ? 2000 : 750
      );
    }
  );

  it.each(ABUSE_GUARD_FAMILIES)(
    'uses the family timeout for binding %s',
    async (family) => {
      const timer = vi.spyOn(globalThis, 'setTimeout');
      configureAbuseGuardRuntime({
        binding: {
          run: async () => ({
            v: 1,
            steps: [{ results: [{ op: 'kv.get', v: null }] }],
          }),
        },
        pepper: 'p'.repeat(40),
        families: family,
      });
      const selection = selectAbuseGuard(family, {});
      if (selection.kind !== 'durable-object') throw new Error('unconfigured');
      await selection.client.get('key');
      expect(timer.mock.calls.at(-1)?.[1]).toBe(
        family === 'replay' ? 2000 : 750
      );
    }
  );

  it.each(ABUSE_GUARD_FAMILIES)(
    'keeps explicit env overrides clamped for %s',
    (family) => {
      for (const [input, expected] of [
        ['1', 100],
        ['9999', 2000],
        ['1250.9', 1250],
        ['750', 750],
      ] as const) {
        expect(parseAbuseGuardTimeout(input, family)).toBe(expected);
      }
      for (const input of [undefined, '', 'invalid', 'Infinity']) {
        expect(parseAbuseGuardTimeout(input, family)).toBe(
          family === 'replay' ? 2000 : 750
        );
      }
    }
  );
});
