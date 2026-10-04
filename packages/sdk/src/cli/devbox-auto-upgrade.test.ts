import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DevboxCliRepairRequiredError,
  DevboxCliUpgradeBusyError,
  upgradeDevboxCliIfNeeded,
} from './devbox-auto-upgrade';

describe('idle devbox CLI upgrades', () => {
  let directory: string;
  const fetchImpl = vi.fn<typeof fetch>();
  const runCommand =
    vi.fn<
      (
        command: string,
        args: string[]
      ) => Promise<{ code: number; stdout: string }>
    >();
  const options = () => ({
    directory,
    fetchImpl,
    runCommand,
    currentVersion: '0.26.0',
    cliCommand: ['bun', '/global/ttr.js'],
    now: 100_000,
  });
  const stateFile = () =>
    join(
      directory,
      `devbox-cli-upgrade-${createHash('sha256').update(JSON.stringify(options().cliCommand)).digest('hex')}.json`
    );
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ttr-auto-upgrade-'));
    fetchImpl
      .mockReset()
      .mockResolvedValue(new Response(JSON.stringify({ version: '0.27.0' })));
    runCommand.mockReset().mockImplementation(async (_command, args) => ({
      code: 0,
      stdout: args.includes('--version') ? '0.27.0\n' : '',
    }));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('pins a stable release, verifies it, and throttles checks across restarts', async () => {
    expect(await upgradeDevboxCliIfNeeded(options())).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('bun', [
      'i',
      '-g',
      'tuturuuu@0.27.0',
    ]);
    expect(
      JSON.parse(await readFile(stateFile(), 'utf8')).installedVersion
    ).toBe('0.27.0');
    expect(
      await upgradeDevboxCliIfNeeded({ ...options(), currentVersion: '0.27.0' })
    ).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Other agents sharing this install must also restart into the new version.
    expect(await upgradeDevboxCliIfNeeded(options())).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not downgrade or reinstall a current release', async () => {
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ version: '0.26.0' }))
    );
    expect(await upgradeDevboxCliIfNeeded(options())).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('does not mutate an install while another process holds its lock', async () => {
    await mkdir(join(directory, 'devbox-cli-upgrade.lock'));
    await expect(upgradeDevboxCliIfNeeded(options())).rejects.toBeInstanceOf(
      DevboxCliUpgradeBusyError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    // The lock holder finishes upgrading; the losing process must restart too.
    await writeFile(
      stateFile(),
      JSON.stringify({
        checkedAt: 100_000,
        installedVersion: '0.27.0',
        commandKey: JSON.stringify(options().cliCommand),
      })
    );
    await rm(join(directory, 'devbox-cli-upgrade.lock'), { recursive: true });
    expect(await upgradeDevboxCliIfNeeded(options())).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['bun', '/different/ttr.js'],
    ['bun', '/global/ttr.js'],
  ])(
    'does not let unrelated or unverifiable cached state suppress registry checks for %j',
    async (...command) => {
      await writeFile(
        stateFile(),
        JSON.stringify({
          checkedAt: 100_000,
          installedVersion: '0.27.0',
          commandKey: JSON.stringify(command),
        })
      );
      runCommand.mockResolvedValue({ code: 0, stdout: '0.26.0' });
      fetchImpl.mockResolvedValue(
        new Response(JSON.stringify({ version: '0.26.0' }))
      );
      expect(await upgradeDevboxCliIfNeeded(options())).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('leaves source-checkout agents alone', async () => {
    expect(
      await upgradeDevboxCliIfNeeded({
        ...options(),
        cliCommand: ['bun', '/repo/index.ts'],
      })
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['0.27.0-beta.1', '0.27.0;echo unsafe', null])(
    'rejects invalid registry version %j before install',
    async (version) => {
      fetchImpl.mockResolvedValue(new Response(JSON.stringify({ version })));
      await expect(upgradeDevboxCliIfNeeded(options())).rejects.toThrow(
        'invalid stable version'
      );
      expect(runCommand).not.toHaveBeenCalled();
    }
  );

  it('throttles registry failures instead of retrying on every service restart', async () => {
    fetchImpl.mockRejectedValue(new Error('network unavailable'));
    await expect(upgradeDevboxCliIfNeeded(options())).rejects.toThrow(
      'network unavailable'
    );
    expect(await upgradeDevboxCliIfNeeded(options())).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rolls back an unverified install and requires repair when rollback fails', async () => {
    runCommand.mockResolvedValue({ code: 1, stdout: '' });
    await expect(upgradeDevboxCliIfNeeded(options())).rejects.toBeInstanceOf(
      DevboxCliRepairRequiredError
    );
    expect(runCommand).toHaveBeenCalledWith('bun', [
      'i',
      '-g',
      'tuturuuu@0.26.0',
    ]);
    await writeFile(stateFile(), '{}');
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ version: '0.27.0' }))
    );
    runCommand.mockImplementation(async (_command, args) => ({
      code: args.includes('tuturuuu@0.27.0') ? 1 : 0,
      stdout: args.includes('--version') ? '0.26.0' : '',
    }));
    await expect(upgradeDevboxCliIfNeeded(options())).rejects.toThrow(
      'previous version restored'
    );
  });
});
