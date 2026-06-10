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
import type { TuturuuuUserClient } from '../platform';
import { runDevboxSetup } from './devbox-setup';
import type { DevboxSetupCommandRunner } from './devbox-setup-command';

const doctorOk = {
  containerized: true as const,
  missingTools: [],
  packageManager: null,
  setupCommands: [],
  status: 'ok' as const,
  tools: {
    bun: '1.3.14',
    docker: 'Docker version 28.0.0',
    git: 'git version 2.50.0',
    node: 'v24.0.0',
  },
};

async function preparePlatformShape(checkoutDir: string) {
  await mkdir(join(checkoutDir, 'apps', 'database'), { recursive: true });
  await mkdir(join(checkoutDir, 'apps', 'web'), { recursive: true });
  await writeFile(join(checkoutDir, 'package.json'), '{"name":"platform"}\n');
  await writeFile(
    join(checkoutDir, 'apps', 'web', '.env.example'),
    [
      'NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY',
    ].join('\n')
  );
}

async function prepareInvalidDirectory(pathname: string) {
  await mkdir(pathname, { recursive: true });
  await writeFile(join(pathname, 'README.md'), 'not platform\n');
}

function createSetupRunner(options: {
  gitRoot?: string | null;
  platformRoots?: Set<string>;
}) {
  const commands: string[] = [];
  const platformRoots = options.platformRoots ?? new Set<string>();
  const runCommand: DevboxSetupCommandRunner = async (
    command,
    args,
    commandOptions
  ) => {
    commands.push(`${command} ${args.join(' ')}`);

    if (command === 'git' && args[2] === 'rev-parse') {
      return options.gitRoot
        ? { code: 0, stderr: '', stdout: `${options.gitRoot}\n` }
        : { code: 1, stderr: '', stdout: '' };
    }

    if (command === 'git' && args[2] === 'config') {
      return platformRoots.has(args[1]!)
        ? {
            code: 0,
            stderr: '',
            stdout: 'https://github.com/tutur3u/platform.git\n',
          }
        : { code: 1, stderr: '', stdout: '' };
    }

    if (command === 'git' && args[0] === 'clone') {
      const checkoutDir = args[2]!;
      await preparePlatformShape(checkoutDir);
      platformRoots.add(checkoutDir);
      return { code: 0, stderr: '', stdout: '' };
    }

    if (command === 'bun' && args.join(' ') === 'install --frozen-lockfile') {
      return { code: 0, stderr: '', stdout: '' };
    }

    if (command === 'bun' && args.join(' ') === 'sb:start') {
      expect(commandOptions.redactOutput).toBe(true);
      return { code: 0, stderr: '', stdout: '' };
    }

    if (command === 'bun' && args.join(' ') === 'supabase status -o json') {
      expect(commandOptions.capture).toBe(true);
      return {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          'API URL': 'http://127.0.0.1:8001',
          'DB URL': 'postgresql://postgres:postgres@127.0.0.1:8002/postgres',
          'Studio URL': 'http://127.0.0.1:8003',
          'anon key': 'anon-local',
          'service_role key': 'service-local',
        }),
      };
    }

    if (command === 'sudo') {
      return { code: 0, stderr: '', stdout: '' };
    }

    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  return { commands, platformRoots, runCommand };
}

describe('devbox setup checkout and runner service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the current platform checkout when --dir is omitted', async () => {
    const checkoutDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-current-'));
    await preparePlatformShape(checkoutDir);
    const { commands, runCommand } = createSetupRunner({
      gitRoot: checkoutDir,
      platformRoots: new Set([checkoutDir]),
    });

    const report = await runDevboxSetup({
      cwd: checkoutDir,
      doctorReport: doctorOk,
      runCommand,
      stdout: () => {},
    });

    expect(report).toMatchObject({
      checkout: {
        path: checkoutDir,
        source: 'current',
        status: 'reused',
      },
    });
    expect(commands.some((command) => command.startsWith('git clone'))).toBe(
      false
    );

    await rm(checkoutDir, { force: true, recursive: true });
  });

  it('uses the current platform checkout when --dir . is valid', async () => {
    const checkoutDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-dot-'));
    await preparePlatformShape(checkoutDir);
    const { runCommand } = createSetupRunner({
      platformRoots: new Set([checkoutDir]),
    });

    const report = await runDevboxSetup({
      cwd: checkoutDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      stdout: () => {},
    });

    expect(report).toMatchObject({
      checkout: {
        path: checkoutDir,
        source: 'explicit',
        status: 'reused',
      },
    });

    await rm(checkoutDir, { force: true, recursive: true });
  });

  it('prompts to clone invalid --dir . into ./tuturuuu', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-invalid-'));
    await prepareInvalidDirectory(targetDir);
    const cloneDir = join(targetDir, 'tuturuuu');
    const confirm = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const { commands, runCommand } = createSetupRunner({});

    const report = await runDevboxSetup({
      confirm,
      cwd: targetDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      stdout: () => {},
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining(`into ${cloneDir}`)
    );
    expect(report).toMatchObject({
      checkout: {
        path: cloneDir,
        source: 'clone-into',
        status: 'cloned',
      },
    });
    expect(commands).toContain(
      `git clone https://github.com/tutur3u/platform.git ${cloneDir}`
    );

    await rm(targetDir, { force: true, recursive: true });
  });

  it('fails non-interactive invalid explicit --dir with --clone-into guidance', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-invalid-json-'));
    await prepareInvalidDirectory(targetDir);
    const { runCommand } = createSetupRunner({});

    await expect(
      runDevboxSetup({
        cwd: targetDir,
        dir: '.',
        doctorReport: doctorOk,
        json: true,
        runCommand,
        stdout: () => {},
      })
    ).rejects.toThrow('--clone-into');

    await rm(targetDir, { force: true, recursive: true });
  });

  it('clones and initializes the explicit --clone-into target', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-clone-into-'));
    await prepareInvalidDirectory(targetDir);
    const cloneDir = join(targetDir, 'tuturuuu');
    const { commands, runCommand } = createSetupRunner({});

    const report = await runDevboxSetup({
      cloneInto: './tuturuuu',
      cwd: targetDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      stdout: () => {},
    });

    expect(report).toMatchObject({
      checkout: {
        path: cloneDir,
        source: 'clone-into',
        status: 'cloned',
      },
    });
    expect(commands).toContain(
      `git clone https://github.com/tutur3u/platform.git ${cloneDir}`
    );

    await rm(targetDir, { force: true, recursive: true });
  });

  it('skips runner registration and service installation unless selected', async () => {
    const checkoutDir = await mkdtemp(join(tmpdir(), 'ttr-devbox-skip-agent-'));
    await preparePlatformShape(checkoutDir);
    const client = {
      devboxes: {
        registerAgent: vi.fn(),
      },
    } as unknown as TuturuuuUserClient;
    const { runCommand } = createSetupRunner({
      platformRoots: new Set([checkoutDir]),
    });

    const report = await runDevboxSetup({
      client,
      cwd: checkoutDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      stdout: () => {},
    });

    expect(client.devboxes.registerAgent).not.toHaveBeenCalled();
    expect('runner' in report).toBe(false);

    await rm(checkoutDir, { force: true, recursive: true });
  });

  it('installs a systemd runner service with the resolved checkout directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-devbox-systemd-'));
    const checkoutDir = join(root, 'checkout');
    const configDir = join(root, 'config');
    const tokenFile = join(configDir, 'runner.env');
    await preparePlatformShape(checkoutDir);
    vi.stubEnv('TUTURUUU_CONFIG', join(configDir, 'config.json'));
    const client = {
      devboxes: {
        registerAgent: vi.fn().mockResolvedValue({
          runner: { id: 'runner-1', name: 'systemd-runner' },
          token: 'secret-token',
        }),
      },
    } as unknown as TuturuuuUserClient;
    const { commands, runCommand } = createSetupRunner({
      platformRoots: new Set([checkoutDir]),
    });
    const stdout: string[] = [];

    const report = await runDevboxSetup({
      agent: true,
      client,
      cwd: checkoutDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      service: true,
      serviceManager: 'systemd',
      stdout: (value) => stdout.push(value),
      tokenFile,
    });

    const serviceFile = join(configDir, 'tuturuuu-devbox-runner.service');
    await expect(readFile(tokenFile, 'utf8')).resolves.toContain(
      'TUTURUUU_DEVBOX_RUNNER_TOKEN=secret-token'
    );
    expect((await stat(tokenFile)).mode & 0o777).toBe(0o600);
    await expect(readFile(serviceFile, 'utf8')).resolves.toContain(
      `WorkingDirectory=${checkoutDir}`
    );
    await expect(readFile(serviceFile, 'utf8')).resolves.toContain(
      'Restart=always'
    );
    const wrapperFile = join(configDir, 'devbox-runner.sh');
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain('set -a');
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain(
      `. '${tokenFile}'\nset +a`
    );
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain(
      'export PATH'
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        `sudo cp ${serviceFile} /etc/systemd/system/tuturuuu-devbox-runner.service`,
        'sudo systemctl daemon-reload',
        'sudo systemctl enable --now tuturuuu-devbox-runner.service',
      ])
    );
    expect(JSON.stringify(report)).not.toContain('secret-token');
    expect(stdout.join('')).not.toContain('secret-token');

    await rm(root, { force: true, recursive: true });
  });

  it('installs a launchd runner service with the resolved checkout directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-devbox-launchd-'));
    const checkoutDir = join(root, 'checkout');
    const configDir = join(root, 'config');
    const tokenFile = join(configDir, 'runner.env');
    await preparePlatformShape(checkoutDir);
    vi.stubEnv('TUTURUUU_CONFIG', join(configDir, 'config.json'));
    const client = {
      devboxes: {
        registerAgent: vi.fn().mockResolvedValue({
          runner: { id: 'runner-2', name: 'launchd-runner' },
          token: 'launchd-secret-token',
        }),
      },
    } as unknown as TuturuuuUserClient;
    const { commands, runCommand } = createSetupRunner({
      platformRoots: new Set([checkoutDir]),
    });

    const report = await runDevboxSetup({
      agent: true,
      client,
      cwd: checkoutDir,
      dir: '.',
      doctorReport: doctorOk,
      runCommand,
      service: true,
      serviceManager: 'launchd',
      stdout: () => {},
      tokenFile,
    });

    const plistFile = join(configDir, 'com.tuturuuu.devbox-runner.plist');
    await expect(readFile(plistFile, 'utf8')).resolves.toContain(
      `<string>${checkoutDir}</string>`
    );
    await expect(readFile(plistFile, 'utf8')).resolves.toContain(
      '<key>KeepAlive</key>'
    );
    const wrapperFile = join(configDir, 'devbox-runner.sh');
    await expect(readFile(wrapperFile, 'utf8')).resolves.toContain(
      `. '${tokenFile}'\nset +a`
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        `sudo cp ${plistFile} /Library/LaunchDaemons/com.tuturuuu.devbox-runner.plist`,
        'sudo launchctl bootstrap system /Library/LaunchDaemons/com.tuturuuu.devbox-runner.plist',
        'sudo launchctl enable system/com.tuturuuu.devbox-runner',
        'sudo launchctl kickstart -k system/com.tuturuuu.devbox-runner',
      ])
    );
    expect(JSON.stringify(report)).not.toContain('launchd-secret-token');

    await rm(root, { force: true, recursive: true });
  });
});
