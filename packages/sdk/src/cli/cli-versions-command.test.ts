import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateRelease: vi.fn(),
  installRelease: vi.fn(),
  listReleases: vi.fn(),
  pruneReleases: vi.fn(),
  upgradeCli: vi.fn(),
}));
vi.mock('./upgrade', () => ({ upgradeCli: mocks.upgradeCli }));
vi.mock('./cli-versions', () => ({
  activateRelease: mocks.activateRelease,
  cliStore: () => '/home/me/.tuturuuu/cli',
  installRelease: mocks.installRelease,
  listReleases: mocks.listReleases,
  pruneReleases: mocks.pruneReleases,
}));

import { runUpgrade } from './cli-versions-command';
import { runCli } from './commands';
import { getHelpOutput } from './help';

afterEach(() => vi.clearAllMocks());

describe('ttr upgrade routing', () => {
  it('keeps the bare command on the legacy global upgrade', async () => {
    await runUpgrade(undefined, [], false);
    expect(mocks.upgradeCli).toHaveBeenCalledOnce();
    expect(mocks.installRelease).not.toHaveBeenCalled();
  });

  it('never turns an unknown subcommand into a global install', async () => {
    await expect(runUpgrade('instal', ['0.29.0'], false)).rejects.toThrow(
      /Unknown upgrade action "instal"/u
    );
    expect(mocks.upgradeCli).not.toHaveBeenCalled();
  });

  it.each([
    ['--unknown'],
    ['--no-update-check', 'list'],
    ['--no-update-check=invalid'],
    ['status'],
    ['show'],
    ['version'],
    ['--unknown=value'],
    ['--json'],
    ['--keep', '2'],
    ['list', '--unknown'],
    ['list', 'extra'],
    ['install', '1', 'extra'],
    ['list', '--json=false'],
    ['activate', '1', '--keep', '2'],
  ])('rejects unsupported upgrade arguments: %j', async (...argv) => {
    await expect(runCli(['upgrade', ...argv])).rejects.toThrow(
      /Usage: ttr upgrade/u
    );
    for (const mutation of [
      mocks.upgradeCli,
      mocks.installRelease,
      mocks.activateRelease,
      mocks.pruneReleases,
    ])
      expect(mutation).not.toHaveBeenCalled();
  });

  it.each([[], ['--json']])(
    'lists releases without any mutation: %j',
    async (...argv) => {
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mocks.listReleases.mockResolvedValue([]);
      await runCli(['upgrade', 'list', ...argv]);
      expect(mocks.listReleases).toHaveBeenCalledOnce();
      for (const mutation of [
        mocks.upgradeCli,
        mocks.installRelease,
        mocks.activateRelease,
        mocks.pruneReleases,
      ])
        expect(mutation).not.toHaveBeenCalled();
    }
  );

  it('routes side-by-side subcommands with their arguments', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.installRelease.mockResolvedValue({
      path: '/v',
      release: { version: '0.29.0', files: 1, integrity: 'sha512-x' },
      reused: false,
    });
    mocks.pruneReleases.mockResolvedValue([]);
    await runUpgrade('install', [], true);
    expect(mocks.installRelease).toHaveBeenCalledWith({ spec: 'latest' });
    await runUpgrade('prune', [], true, '2');
    expect(mocks.pruneReleases).toHaveBeenCalledWith({ keep: 2 });
    await expect(runUpgrade('activate', [], true)).rejects.toThrow(
      /ttr upgrade activate <version>/u
    );
    expect(mocks.activateRelease).not.toHaveBeenCalled();
    expect(mocks.upgradeCli).not.toHaveBeenCalled();
  });

  it('documents the side-by-side subcommands in scoped help', () => {
    const help = getHelpOutput('upgrade');
    expect(help).toContain('Usage: ttr upgrade [install|activate|list|prune]');
    for (const action of ['install', 'activate', 'list', 'prune'])
      expect(help).toContain(`ttr upgrade ${action}`);
  });
});
