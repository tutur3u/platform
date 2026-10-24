import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import {
  checkCredentialIsolation,
  collectDevboxIsolation,
  type DevboxIsolationProbes,
  evaluateDevboxIsolation,
} from './devbox-isolation';
import { assertRunnerExecutionModeUnchanged } from './devbox-service-mode-guard';
import { setupDevboxRunner } from './devbox-setup-service';

const DIR = 0o040000;
const FILE = 0o100000;
const LINK = 0o120000;

const judgeProbes = (
  overrides: Partial<DevboxIsolationProbes> = {}
): Partial<DevboxIsolationProbes> => ({
  env: {
    TUTURUUU_DEVBOX_SERVICE_USER: 'judge',
    DOCKER_HOST: 'unix:///run/judge/docker.sock',
    INVOCATION_ID: 'unit',
  },
  platform: 'linux',
  user: () => ({ uid: 990, username: 'judge' }),
  stat: async (path) => ({
    uid: 990,
    gid: 990,
    mode: (path.endsWith('.env') ? FILE : DIR) | 0o600,
  }),
  realpath: async (path) => path,
  readdir: async () => [],
  run: async (command) =>
    command === 'docker'
      ? { code: 0, stdout: 'runsc\n' }
      : { code: 0, stdout: 'judge\n' },
  ...overrides,
});

const byCheck = (
  findings: { check: string; status: string }[],
  check: string
) => findings.find((finding) => finding.check === check)?.status;

describe('doctor --isolation evidence', () => {
  it('reports undetermined checks as unknown and fails the mode minimum', async () => {
    const { summary, findings } = await collectDevboxIsolation({
      tokenFile: '/var/lib/judge/private/devbox-runner.env',
      probes: judgeProbes({
        env: { TUTURUUU_DEVBOX_SERVICE_USER: 'judge' },
        run: async () => ({ code: 1, stdout: '' }),
      }),
    });
    expect(byCheck(findings, 'gvisorDefault')).toBe('unknown');
    expect(byCheck(findings, 'dedicatedDockerSocket')).toBe('unknown');
    expect(byCheck(findings, 'noGeneralDockerGroup')).toBe('unknown');
    expect(summary).not.toHaveProperty('gvisorDefault');
    const judge = evaluateDevboxIsolation(findings, 'judge-only');
    expect(judge.ok).toBe(false);
    expect(judge.missing).toEqual([
      'dedicatedDockerSocket',
      'gvisorDefault',
      'noGeneralDockerGroup',
    ]);
    // Trusted mode only needs a dedicated user and a private token.
    expect(evaluateDevboxIsolation(findings, 'trusted').ok).toBe(true);
  });

  it('fails a trusted runner with no configured service user', async () => {
    const { findings } = await collectDevboxIsolation({
      tokenFile: '/var/lib/dev/private/devbox-runner.env',
      probes: judgeProbes({ env: {} }),
    });
    expect(byCheck(findings, 'dedicatedUser')).toBe('unknown');
    expect(evaluateDevboxIsolation(findings, 'trusted')).toMatchObject({
      ok: false,
      missing: ['dedicatedUser'],
    });
  });

  it('treats an unset DOCKER_HOST with a reachable daemon as the general socket', async () => {
    const { findings } = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({ env: { TUTURUUU_DEVBOX_SERVICE_USER: 'judge' } }),
    });
    expect(byCheck(findings, 'dedicatedDockerSocket')).toBe('fail');
    const remote = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({
        env: {
          TUTURUUU_DEVBOX_SERVICE_USER: 'judge',
          DOCKER_HOST: 'tcp://10.0.0.2:2375',
        },
      }),
    });
    expect(byCheck(remote.findings, 'dedicatedDockerSocket')).toBe('unknown');
  });

  it('rejects a general socket reached through a symlink', async () => {
    const { findings } = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({
        env: {
          TUTURUUU_DEVBOX_SERVICE_USER: 'judge',
          DOCKER_HOST: 'unix:///srv/judge.sock',
        },
        realpath: async (path) =>
          path === '/srv/judge.sock' || path === '/var/run/docker.sock'
            ? '/run/docker.sock'
            : path,
      }),
    });
    expect(byCheck(findings, 'dedicatedDockerSocket')).toBe('fail');
  });

  it('labels protectedService advisory and never passes it on EACCES', async () => {
    const eacces = Object.assign(new Error('denied'), { code: 'EACCES' });
    const { findings } = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({
        readdir: async () => {
          throw eacces;
        },
      }),
    });
    const protectedService = findings.find(
      (finding) => finding.check === 'protectedService'
    );
    expect(protectedService).toMatchObject({
      status: 'unknown',
      advisory: true,
    });
    const visible = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({ readdir: async () => ['dev'] }),
    });
    expect(byCheck(visible.findings, 'protectedService')).toBe('fail');
    // Advisory evidence never decides the result.
    expect(evaluateDevboxIsolation(visible.findings, 'judge-only').ok).toBe(
      true
    );
  });

  it('fails a symlinked token path', async () => {
    const { findings } = await collectDevboxIsolation({
      tokenFile: '/x/devbox-runner.env',
      probes: judgeProbes({
        stat: async (path) => ({
          uid: 990,
          gid: 990,
          mode: (path.endsWith('.env') ? LINK : DIR) | 0o600,
        }),
      }),
    });
    expect(byCheck(findings, 'privateTokenDirectory')).toBe('fail');
  });
});

describe('--other-user credential isolation', () => {
  // A tiny fake filesystem: path -> [uid, gid, mode].
  const fs = (entries: Record<string, [number, number, number]>) => ({
    stat: async (path: string) => {
      const entry = entries[path];
      if (!entry) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return { uid: entry[0], gid: entry[1], mode: entry[2] };
    },
    realpath: async (path: string) => path,
  });
  const base: Record<string, [number, number, number]> = {
    '/': [0, 0, DIR | 0o755],
    '/home': [0, 0, DIR | 0o755],
    '/home/dev': [1000, 1000, DIR | 0o700],
    '/home/dev/.config': [1000, 1000, DIR | 0o700],
    '/home/dev/.config/tuturuuu': [1000, 1000, DIR | 0o700],
    '/home/dev/.config/tuturuuu/devbox-runner.env': [1000, 1000, FILE | 0o600],
    '/home/dev/platform': [1000, 1000, DIR | 0o755],
    '/home/dev/platform/.env.local': [1000, 1000, FILE | 0o644],
    '/home/dev/platform/.env.example': [1000, 1000, FILE | 0o644],
  };
  const run =
    (groups = 'judge', acl = 'user::rw-\ngroup::---\nother::---\n') =>
    async (command: string, args: string[]) =>
      command === 'getfacl'
        ? { code: 0, stdout: acl }
        : args[0] === '-u'
          ? { code: 0, stdout: groups.includes('root') ? '0\n' : '990\n' }
          : args[0] === '-G'
            ? { code: 0, stdout: '990\n' }
            : { code: 0, stdout: `${groups}\n` };
  const check = (
    entries = base,
    groups?: string,
    acl?: string
  ): Promise<{ check: string; status: string; detail: string }[]> =>
    checkCredentialIsolation({
      tokenFile: '/home/dev/.config/tuturuuu/devbox-runner.env',
      otherUser: 'judge',
      home: '/home/dev',
      checkoutDir: '/home/dev/platform',
      probes: {
        ...fs(entries),
        platform: 'linux',
        readdir: async (path) =>
          path === '/home/dev/platform' ? ['.env.local', '.env.example'] : [],
        run: run(groups, acl),
      },
    });

  it('passes a private credential, home and checkout', async () => {
    const findings = await check();
    expect(findings.every((finding) => finding.status === 'pass')).toBe(true);
  });

  it.each(['judge docker', 'judge sudo', 'judge wheel', 'judge admin', 'root'])(
    'fails a privileged other user (%s)',
    async (groups) => {
      expect(byCheck(await check(base, groups), 'otherUserUnprivileged')).toBe(
        'fail'
      );
    }
  );

  it('fails a named ACL entry and reports missing ACL tooling as unknown', async () => {
    const granted = await check(
      base,
      'judge',
      'user::rw-\nuser:990:r--\ngroup::---\nmask::r--\nother::---\n'
    );
    expect(byCheck(granted, 'credentialFileAcl')).toBe('fail');
    const findings = await checkCredentialIsolation({
      tokenFile: '/home/dev/.config/tuturuuu/devbox-runner.env',
      otherUser: 'judge',
      probes: {
        ...fs(base),
        platform: 'linux',
        run: async (command, args) =>
          command === 'getfacl'
            ? { code: 127, stdout: '' }
            : await run()(command, args),
      },
    });
    expect(byCheck(findings, 'credentialFileAcl')).toBe('unknown');
  });

  it('fails a reachable home and readable checkout .env files', async () => {
    const findings = await check({
      ...base,
      '/home/dev': [1000, 1000, DIR | 0o755],
    });
    expect(byCheck(findings, 'homeDirectory')).toBe('fail');
    expect(byCheck(findings, 'checkoutDirectory')).toBe('fail');
    const env = findings.find(
      (finding) => finding.check === 'checkoutEnvFiles'
    );
    expect(env?.status).toBe('fail');
    expect(env?.detail).toContain('.env.local');
    expect(env?.detail).not.toContain('.env.example');
  });

  it('fails a symlinked credential instead of following it', async () => {
    const findings = await check({
      ...base,
      '/home/dev/.config/tuturuuu/devbox-runner.env': [
        1000,
        1000,
        LINK | 0o777,
      ],
    });
    expect(byCheck(findings, 'credentialFile')).toBe('fail');
  });
});

describe('runner execution-mode overwrite guard', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true }))
    );
  });
  const fixture = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-mode-guard-'));
    dirs.push(dir);
    const wrapper = join(dir, 'devbox-runner.sh');
    await writeFile(
      wrapper,
      "#!/bin/sh\nexport TUTURUUU_DEVBOX_EXECUTION_MODE='trusted'\n"
    );
    const unit = join(dir, 'tuturuuu-devbox-runner.service');
    await writeFile(unit, `[Service]\nExecStart=${wrapper}\n`);
    return { dir, unit, wrapper };
  };

  it('refuses to replace a trusted unit or wrapper with a Judge runner', async () => {
    const { dir, unit } = await fixture();
    await expect(
      assertRunnerExecutionModeUnchanged({
        executionMode: 'judge-only',
        definitionPath: unit,
        scriptPaths: [join(dir, 'missing.sh')],
      })
    ).rejects.toThrow('--force');
    await expect(
      assertRunnerExecutionModeUnchanged({
        executionMode: 'judge-only',
        force: true,
        definitionPath: unit,
        scriptPaths: [],
      })
    ).resolves.toBeUndefined();
    await expect(
      assertRunnerExecutionModeUnchanged({
        executionMode: 'trusted',
        definitionPath: unit,
        scriptPaths: [],
      })
    ).resolves.toBeUndefined();
  });

  it('refuses to downgrade a protected Judge unit to trusted', async () => {
    const { dir } = await fixture();
    const unit = join(dir, 'judge.service');
    await writeFile(unit, '[Service]\nProtectHome=yes\n');
    await expect(
      assertRunnerExecutionModeUnchanged({
        executionMode: 'trusted',
        definitionPath: unit,
        scriptPaths: [],
      })
    ).rejects.toThrow('judge-only');
  });

  it.each([false, true])(
    'checks the normalized token file before registration (padded: %s)',
    async (padded) => {
      const { dir } = await fixture();
      const tokenFile = join(dir, 'devbox-runner.env');
      await writeFile(
        tokenFile,
        "TUTURUUU_DEVBOX_RUNNER_TOKEN='x'\nTUTURUUU_DEVBOX_EXECUTION_MODE='judge-only'\n",
        { mode: 0o600 }
      );
      const original = await readFile(tokenFile, 'utf8');
      const registerAgent = vi.fn();
      await expect(
        setupDevboxRunner({
          checkoutDir: dir,
          options: {
            agent: true,
            client: {
              devboxes: { registerAgent },
            } as unknown as TuturuuuUserClient,
            executionMode: 'trusted',
            json: true,
            runCommand: vi.fn(),
            tokenFile: padded ? `  ${tokenFile}  ` : tokenFile,
          },
        })
      ).rejects.toThrow('--service-name');
      expect(registerAgent).not.toHaveBeenCalled();
      expect(await readFile(tokenFile, 'utf8')).toBe(original);
    }
  );
});
