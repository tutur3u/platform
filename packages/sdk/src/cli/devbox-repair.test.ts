import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDevboxRepair } from './devbox-repair';
import type { DevboxSetupCommandRunner } from './devbox-setup-command';

async function preparePlatformShape(checkoutDir: string) {
  await mkdir(join(checkoutDir, 'apps', 'database'), { recursive: true });
  await mkdir(join(checkoutDir, 'apps', 'web'), { recursive: true });
  await writeFile(join(checkoutDir, 'package.json'), '{"name":"platform"}\n');
}

function createRepairRunner(platformRoots: Set<string>) {
  const commands: string[] = [];
  const runCommand: DevboxSetupCommandRunner = async (command, args) => {
    commands.push(`${command} ${args.join(' ')}`);

    if (command === 'git' && args[2] === 'config') {
      return platformRoots.has(args[1]!)
        ? {
            code: 0,
            stderr: '',
            stdout: 'https://github.com/tutur3u/platform.git\n',
          }
        : { code: 1, stderr: '', stdout: '' };
    }

    if (command === 'sudo') {
      return { code: 0, stderr: '', stdout: '' };
    }

    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  return { commands, runCommand };
}

describe('devbox repair', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('repairs a systemd runner service using an existing token file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-devbox-repair-systemd-'));
    const checkoutDir = join(root, 'checkout');
    const configDir = join(root, 'config');
    const tokenFile = join(configDir, 'runner.env');
    await preparePlatformShape(checkoutDir);
    await mkdir(configDir, { recursive: true });
    await writeFile(tokenFile, 'TUTURUUU_DEVBOX_RUNNER_TOKEN=secret-token\n');
    vi.stubEnv('TUTURUUU_CONFIG', join(configDir, 'config.json'));
    const { commands, runCommand } = createRepairRunner(new Set([checkoutDir]));
    const stdout: string[] = [];

    const report = await runDevboxRepair({
      cwd: checkoutDir,
      dir: '.',
      runCommand,
      serviceManager: 'systemd',
      stdout: (value) => stdout.push(value),
      tokenFile,
    });

    const serviceFile = join(configDir, 'tuturuuu-devbox-runner.service');
    const wrapperFile = join(configDir, 'devbox-runner.sh');
    await expect(readFile(serviceFile, 'utf8')).resolves.toContain(
      `WorkingDirectory=${checkoutDir}`
    );
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain('set -a');
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain(
      `. '${tokenFile}'\nset +a`
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        `sudo cp ${serviceFile} /etc/systemd/system/tuturuuu-devbox-runner.service`,
        'sudo systemctl daemon-reload',
        'sudo systemctl enable --now tuturuuu-devbox-runner.service',
        'sudo systemctl restart tuturuuu-devbox-runner.service',
      ])
    );
    expect(report).toMatchObject({
      service: {
        manager: 'systemd',
        restarted: true,
      },
      status: 'ok',
    });
    expect(JSON.stringify(report)).not.toContain('secret-token');
    expect(stdout.join('')).not.toContain('secret-token');

    await rm(root, { force: true, recursive: true });
  });

  it('supports dry-run repair without writing service files or running sudo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-devbox-repair-dry-'));
    const checkoutDir = join(root, 'checkout');
    const configDir = join(root, 'config');
    const tokenFile = join(configDir, 'runner.env');
    await preparePlatformShape(checkoutDir);
    await mkdir(configDir, { recursive: true });
    await writeFile(tokenFile, 'TUTURUUU_DEVBOX_RUNNER_TOKEN=secret-token\n');
    vi.stubEnv('TUTURUUU_CONFIG', join(configDir, 'config.json'));
    const { commands, runCommand } = createRepairRunner(new Set([checkoutDir]));

    const report = await runDevboxRepair({
      cwd: checkoutDir,
      dir: '.',
      dryRun: true,
      json: true,
      runCommand,
      serviceManager: 'systemd',
      stdout: () => {},
      tokenFile,
    });

    expect(commands.some((command) => command.startsWith('sudo '))).toBe(false);
    await expect(stat(join(configDir, 'devbox-runner.sh'))).rejects.toThrow();
    expect(report).toMatchObject({
      service: {
        dryRun: true,
        manager: 'systemd',
        restarted: false,
      },
    });
    expect(JSON.stringify(report)).not.toContain('secret-token');

    await rm(root, { force: true, recursive: true });
  });

  it('fails when the runner token file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-devbox-repair-missing-'));
    const checkoutDir = join(root, 'checkout');
    await preparePlatformShape(checkoutDir);
    const { runCommand } = createRepairRunner(new Set([checkoutDir]));

    await expect(
      runDevboxRepair({
        cwd: checkoutDir,
        dir: '.',
        runCommand,
        serviceManager: 'systemd',
        stdout: () => {},
        tokenFile: join(root, 'missing.env'),
      })
    ).rejects.toThrow('Missing runner token file');

    await rm(root, { force: true, recursive: true });
  });
});
