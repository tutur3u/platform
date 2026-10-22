import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secret = 'SYNTHETIC_PRIVATE_TOKEN';
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'feedback-entry-'));
  vi.stubEnv('TUTURUUU_CONFIG', join(directory, 'config.json'));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error(secret);
    })
  );
  process.exitCode = 0;
  await import('./commands');
  await new Promise<void>((resolve) => setImmediate(resolve));
});
afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});
async function invoke(argv: string[], code: string, status: number) {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.argv = [
    'bun',
    'index.ts',
    'feedback',
    ...argv,
    '--json',
    '--no-update-check',
  ];
  await import('./index');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(stdout).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledTimes(1);
  const output = String(stderr.mock.calls[0]?.[0]);
  expect(JSON.parse(output)).toEqual({
    error: { code, status, message: `${code} (${status})` },
  });
  expect(output).not.toContain(secret);
  expect(output).not.toMatch(
    /Bearer|refreshToken|accessToken|stack|https:\/\//
  );
  expect(fetch).not.toHaveBeenCalled();
}
describe('feedback real CLI entrypoint errors', () => {
  it.each([
    ['show', 'not-a-uuid'],
    ['list', '--limit', '1', '--limit=2'],
    ['list', '--actor', secret],
  ])(
    'projects invalid arguments before reading credentials: %j',
    async (...argv) => {
      const read = vi.spyOn(await import('./config'), 'readCliConfig');
      await invoke(argv, 'feedback_invalid_arguments', 400);
      expect(read).not.toHaveBeenCalled();
    }
  );
  it.each([{}, { accessToken: secret }, { refreshToken: secret }])(
    'projects missing credentials without leaking partial sessions: %j',
    async (session) => {
      await writeFile(
        join(directory, 'config.json'),
        JSON.stringify({ baseUrl: 'https://example.test', session })
      );
      await invoke(['list'], 'feedback_unauthorized', 401);
    }
  );
  it('sanitizes configuration failures before client construction', async () => {
    vi.spyOn(await import('./config'), 'readCliConfig').mockRejectedValue(
      new Error(`https://example.test/?token=${secret}`)
    );
    await invoke(['list'], 'feedback_unavailable', 503);
  });
});
