import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDevboxRepair } from './devbox-repair';
import { installDevboxRunnerService } from './devbox-setup-service';

vi.mock('./devbox-host-protection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./devbox-host-protection')>()),
  preflightProtectedService: async ({ checkoutDir }: { checkoutDir: string }) =>
    checkoutDir,
}));

describe('protected service release compatibility', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it('recovers the dedicated service user during repair without repeating the flag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-protected-repair-'));
    const config = join(root, 'config');
    await mkdir(join(root, 'apps', 'database'), { recursive: true });
    await mkdir(join(root, 'apps', 'web'), { recursive: true });
    await mkdir(config);
    await writeFile(join(root, 'package.json'), '{"name":"platform"}');
    const tokenFile = join(config, 'runner.env');
    await writeFile(
      tokenFile,
      "TUTURUUU_DEVBOX_RUNNER_TOKEN=test-token\nTUTURUUU_DEVBOX_EXECUTION_MODE='judge-only'\nTUTURUUU_DEVBOX_SERVICE_USER='judge'\nDOCKER_HOST='unix:///run/judge/docker.sock'\n",
      { mode: 0o600 }
    );
    vi.stubEnv('TUTURUUU_CONFIG', join(config, 'config.json'));
    try {
      await runDevboxRepair({
        cwd: root,
        dir: '.',
        tokenFile,
        serviceManager: 'systemd',
        stdout: () => {},
        runCommand: async (command) => ({
          code: 0,
          stderr: '',
          stdout:
            command === 'git'
              ? 'https://github.com/tutur3u/platform.git\n'
              : '',
        }),
      });
      expect(
        await readFile(join(config, 'tuturuuu-devbox-runner.service'), 'utf8')
      ).toContain('User=judge');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('refuses to start a global CLI without local execution policy support', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttr-protected-wrapper-'));
    const config = join(root, 'config');
    const bin = join(root, '.bun', 'bin');
    await mkdir(config, { recursive: true });
    await mkdir(bin, { recursive: true });
    const tokenFile = join(config, 'runner.env');
    await writeFile(tokenFile, 'TUTURUUU_DEVBOX_RUNNER_TOKEN=test-token\n', {
      mode: 0o600,
    });
    await writeFile(
      join(bin, 'ttr'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/calls"\nexit 1\n'
    );
    await chmod(join(bin, 'ttr'), 0o700);
    vi.stubEnv('TUTURUUU_CONFIG', join(config, 'config.json'));
    try {
      const service = await installDevboxRunnerService({
        checkoutDir: root,
        executionMode: 'judge-only',
        dockerHost: 'unix:///run/judge/docker.sock',
        manager: 'systemd',
        serviceUser: 'judge',
        tokenFile,
        runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
      });
      const wrapper = await readFile(service.wrapperPath, 'utf8');
      expect(wrapper).toContain(
        "export TUTURUUU_DEVBOX_EXECUTION_MODE='judge-only'"
      );
      expect(() =>
        execFileSync('/bin/sh', [service.wrapperPath], {
          env: { HOME: root, PATH: '/usr/bin:/bin' },
          stdio: 'ignore',
        })
      ).toThrow();
      expect(await readFile(join(root, 'calls'), 'utf8')).toBe(
        'box agent policy --no-update-check\n'
      );
      const definition = await readFile(
        join(config, 'tuturuuu-devbox-runner.service'),
        'utf8'
      );
      expect(definition).toContain('ProtectHome=yes');
      expect(definition).toContain('PrivateDevices=yes');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
