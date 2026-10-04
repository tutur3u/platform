import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPersistedRunnerSetting } from './devbox-persisted-setting';
import { runDevboxRepair } from './devbox-repair';
import { runDevboxCommandWithSession } from './devbox-session';

describe('reviewed runner security boundaries', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['judge-only', "'judge-only'", '"judge-only"'])(
    'reads literal policy %s',
    (value) => {
      expect(readPersistedRunnerSetting(`MODE=${value}`, 'MODE')).toBe(
        'judge-only'
      );
    }
  );
  it('decodes shellQuote apostrophes without evaluating commands', () => {
    expect(readPersistedRunnerSetting("PATH='a'\\''b'", 'PATH')).toBe("a'b");
    expect(() => readPersistedRunnerSetting('PATH="$(id)"', 'PATH')).toThrow(
      'Invalid'
    );
  });
  it.each(['"judge-only" # note', "'judge-only", 'judge-only\nMODE=trusted'])(
    'rejects malformed or duplicate policy %s',
    (value) => {
      expect(() => readPersistedRunnerSetting(`MODE=${value}`, 'MODE')).toThrow(
        'Invalid'
      );
    }
  );
  it('rejects malformed persisted policy even when repair explicitly asks for trusted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ttr-policy-'));
    const tokenFile = join(directory, 'runner.env');
    await writeFile(
      tokenFile,
      'TUTURUUU_DEVBOX_RUNNER_TOKEN=fixture\nTUTURUUU_DEVBOX_EXECUTION_MODE="judge-only" # note\n'
    );
    const runCommand = vi.fn();
    try {
      await expect(
        runDevboxRepair({ tokenFile, executionMode: 'trusted', runCommand })
      ).rejects.toThrow('Invalid');
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('allows runner-token shutdown without creating an operator client', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        message: 'Removed',
        runner: { id: 'one', status: 'revoked' },
      })
    );
    const createClient = vi.fn(() => {
      throw new Error('No operator session');
    });
    await runDevboxCommandWithSession({
      action: 'shutdown',
      argv: ['box', 'shutdown'],
      baseUrl: 'https://example.test',
      hasSession: false,
      createClient,
      flags: { token: 'fixture' },
      json: true,
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
