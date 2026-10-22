import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'update-entry-'));
  vi.stubEnv('TUTURUUU_CONFIG', join(directory, 'config.json'));
  vi.stubEnv('TUTURUUU_DISABLE_UPDATE_CHECK', '');
  await writeFile(
    join(directory, 'config.json'),
    JSON.stringify({ baseUrl: 'https://example.test' })
  );
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '999.0.0' }), { status: 200 })
      )
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

async function invoke(argv: string[], fails = false) {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.argv = ['bun', 'index.ts', ...argv];
  await import('./index');
  await vi.waitFor(() => {
    if (fails) expect(process.exitCode).toBe(1);
    else expect(stdout).toHaveBeenCalled();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    'https://registry.npmjs.org/tuturuuu/latest',
    expect.any(Object)
  );
  const config = JSON.parse(
    await readFile(join(directory, 'config.json'), 'utf8')
  );
  expect(config.updateCheck.latestVersion).toBe('999.0.0');
  return { stdout, stderr };
}

describe('CLI update notices with update checking enabled', () => {
  it('prints only JSON on stdout for a JSON command', async () => {
    const { stdout, stderr } = await invoke(['whoami', '--json']);
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      loggedIn: false,
    });
    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('keeps feedback JSON errors free of update notices', async () => {
    const { stdout, stderr } = await invoke(
      ['feedback', 'list', '--json'],
      true
    );
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toEqual({
      error: {
        code: 'feedback_unauthorized',
        status: 401,
        message: 'feedback_unauthorized (401)',
      },
    });
  });

  it('retains update notices for non-JSON commands', async () => {
    const { stderr } = await invoke(['whoami']);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain(
      'A new Tuturuuu CLI version is available:'
    );
    expect(String(stderr.mock.calls[0]?.[0])).toContain(
      'Update with: ttr upgrade'
    );
  });
});
