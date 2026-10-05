import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LETTIN_FIXTURE_COMMAND_OPTIONS,
  lettinFixturePhase,
} from '../../e2e/helpers/lettin-fixture-diagnostics';

afterEach(() => vi.restoreAllMocks());

describe('Lettin fixture diagnostics', () => {
  it('returns results and logs only fixed phase names', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = { token: 'private-test-token' };
    await expect(
      lettinFixturePhase('create fixture account', async () => result)
    ).resolves.toBe(result);
    expect(info.mock.calls).toEqual([
      ['[lettin-e2e] create fixture account: started'],
      ['[lettin-e2e] create fixture account: completed'],
    ]);
  });

  it('rethrows the original error without printing its private body', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('private-test-token https://private.test/actor');
    await expect(
      lettinFixturePhase('install session cookies', async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(warn.mock.calls).toEqual([
      [
        '[lettin-e2e] install session cookies: failed',
        { name: 'Error', message: 'operation failed' },
      ],
    ]);
  });

  it('terminates a child that traps SIGTERM instead of blocking the worker', () => {
    expect(LETTIN_FIXTURE_COMMAND_OPTIONS.timeout).toBe(60_000);
    const started = Date.now();
    try {
      execFileSync(
        process.execPath,
        ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        {
          ...LETTIN_FIXTURE_COMMAND_OPTIONS,
          // Exercise the same kill policy without spending the fixture's minute.
          timeout: 300,
        }
      );
      throw new Error('Expected the owned fixture process to time out');
    } catch (error) {
      expect(error).toMatchObject({ code: 'ETIMEDOUT', signal: 'SIGKILL' });
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
