import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkCredentialIsolation,
  collectDevboxIsolation,
  type DevboxIsolationProbes,
} from './devbox-isolation';
import { executeDevboxAgentJob } from './devbox-runner';
import {
  getDefaultRunnerTokenFile,
  restartDevboxRunnerService,
} from './devbox-setup-service';
import {
  devboxServiceNames,
  getServiceDefinitionPath,
  renderLaunchdPlist,
} from './devbox-setup-service-templates';

const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe('trusted-mode execution fence', () => {
  const run = async (command: string[], env: NodeJS.ProcessEnv) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json({}));
    const result = await executeDevboxAgentJob(
      { command, leaseId: 'lease', runId: 'run' },
      { baseUrl: 'https://example.test', token: 'fixture', fetch, env }
    );
    const first = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    return { result, message: first.events?.[0]?.message as string };
  };

  it('never runs Judge or playground envelopes on a trusted runner', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [kind, command] of [
      ['judge', ['__ttr_judge_v1__', 'payload']],
      ['playground', ['__ttr_playground_v1__', 'payload']],
    ] as const) {
      const { result, message } = await run([...command], {
        TUTURUUU_DEVBOX_EXECUTION_MODE: 'trusted',
      });
      expect(result).toEqual({ exitCode: 1, status: 'failed' });
      // Distinct, auditable message for routing untrusted work to a
      // credentialed host.
      expect(message).toBe(
        `Host execution policy rejected this job: trusted_runner_fence refused a ${kind} envelope on a trusted runner.`
      );
      expect(warn).toHaveBeenCalledWith(
        `[devbox] trusted_runner_fence: refused a ${kind} envelope for run run`
      );
    }
    warn.mockRestore();
  });

  it('confines a playground pool process to playground envelopes', async () => {
    const { result, message } = await run(['sh', '-c', 'echo host'], {
      TUTURUUU_DEVBOX_EXECUTION_MODE: 'trusted',
      TUTURUUU_PLAYGROUND_POOL_ID: 'pool-1',
    });
    expect(result).toEqual({ exitCode: 1, status: 'failed' });
    expect(message).toBe('Host execution policy rejected this job.');
  });
});

describe('per-runner service naming', () => {
  it('keeps legacy names by default and isolates named runners', () => {
    expect(devboxServiceNames()).toMatchObject({
      systemdUnit: 'tuturuuu-devbox-runner.service',
      launchdLabel: 'com.tuturuuu.devbox-runner',
      tokenFile: 'devbox-runner.env',
    });
    expect(devboxServiceNames('trusted')).toMatchObject({
      systemdUnit: 'tuturuuu-devbox-runner-trusted.service',
      launchdLabel: 'com.tuturuuu.devbox-runner.trusted',
      tokenFile: 'devbox-runner-trusted.env',
      wrapperFile: 'devbox-runner-trusted.sh',
    });
    expect(getServiceDefinitionPath('systemd')).toBe(
      '/etc/systemd/system/tuturuuu-devbox-runner.service'
    );
    expect(getServiceDefinitionPath('systemd', 'trusted')).toBe(
      '/etc/systemd/system/tuturuuu-devbox-runner-trusted.service'
    );
    expect(getDefaultRunnerTokenFile('/cfg/config.json', 'trusted')).toBe(
      '/cfg/devbox-runner-trusted.env'
    );
    const plist = renderLaunchdPlist({
      checkoutDir: '/srv',
      serviceName: 'trusted',
      serviceUser: 'dev',
      wrapperPath: '/srv/w.sh',
    });
    expect(plist).toContain(
      '<string>com.tuturuuu.devbox-runner.trusted</string>'
    );
    expect(plist).toContain('tuturuuu-devbox-runner-trusted.log');
  });

  it.each(['Trusted', '../x', 'a b', '-x', 'x'.repeat(41)])(
    'rejects unsafe service name %j',
    (name) => {
      expect(() => devboxServiceNames(name)).toThrow('--service-name');
    }
  );

  it('restarts only the named unit', async () => {
    const runCommand = vi.fn().mockResolvedValue({ code: 0, stdout: '' });
    await restartDevboxRunnerService({
      manager: 'systemd',
      runCommand,
      serviceName: 'trusted',
    });
    expect(runCommand).toHaveBeenCalledWith(
      'sudo',
      ['systemctl', 'restart', 'tuturuuu-devbox-runner-trusted.service'],
      expect.anything()
    );
  });
});

describe('isolation evidence', () => {
  const judgeProfile = (
    overrides: Partial<DevboxIsolationProbes> = {}
  ): Partial<DevboxIsolationProbes> => ({
    env: {
      TUTURUUU_DEVBOX_SERVICE_USER: 'judge',
      DOCKER_HOST: 'unix:///run/judge/docker.sock',
      INVOCATION_ID: 'unit',
    },
    platform: 'linux',
    user: () => ({ uid: 990, username: 'judge' }),
    stat: async () => ({ uid: 990, gid: 990, mode: 0o100600 }),
    realpath: async (path) => path,
    readdir: async () => [],
    run: async (command) =>
      command === 'docker'
        ? { code: 0, stdout: 'runsc\n' }
        : { code: 0, stdout: 'judge\n' },
    ...overrides,
  });

  it('summarizes a protected Judge identity as isolated', async () => {
    const { summary, findings } = await collectDevboxIsolation({
      tokenFile: '/var/lib/judge/private/devbox-runner.env',
      probes: judgeProfile(),
    });
    expect(summary).toMatchObject({
      dedicatedUser: true,
      privateTokenDirectory: true,
      protectedService: true,
      dedicatedDockerSocket: true,
      gvisorDefault: true,
      noGeneralDockerGroup: true,
    });
    expect(findings.every((finding) => finding.ok)).toBe(true);
  });

  it('flags root, shared sockets, docker group and loose token modes', async () => {
    const { summary } = await collectDevboxIsolation({
      tokenFile: '/home/dev/.config/tuturuuu/devbox-runner.env',
      probes: judgeProfile({
        env: {
          TUTURUUU_DEVBOX_SERVICE_USER: 'judge',
          DOCKER_HOST: 'unix:///var/run/docker.sock',
        },
        user: () => ({ uid: 0, username: 'root' }),
        stat: async () => ({ uid: 0, gid: 0, mode: 0o100644 }),
        readdir: async () => ['dev'],
        run: async (command) =>
          command === 'docker'
            ? { code: 0, stdout: 'runc\n' }
            : { code: 0, stdout: 'root docker\n' },
      }),
    });
    expect(summary).toMatchObject({
      dedicatedUser: false,
      privateTokenDirectory: false,
      protectedService: false,
      dedicatedDockerSocket: false,
      gvisorDefault: false,
      noGeneralDockerGroup: false,
    });
  });

  it('proves a real private credential is unreadable by another account', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-isolation-'));
    dirs.push(dir);
    await chmod(dir, 0o700);
    const token = join(dir, 'devbox-runner-trusted.env');
    await writeFile(token, 'TUTURUUU_DEVBOX_RUNNER_TOKEN=fixture\n', {
      mode: 0o600,
    });
    const other = userInfo().username === 'nobody' ? 'root' : 'nobody';
    const findings = await checkCredentialIsolation({
      tokenFile: token,
      otherUser: other,
    });
    const status = (list: typeof findings, check: string) =>
      list.find((finding) => finding.check === check)?.status;
    expect(status(findings, 'credentialFile')).toBe('pass');
    expect(status(findings, 'credentialDirectory')).toBe('pass');
    await chmod(token, 0o644);
    const loose = await checkCredentialIsolation({
      tokenFile: token,
      otherUser: other,
    });
    expect(status(loose, 'credentialFile')).toBe('fail');
  });

  it('fails when the other account shares the credential group or owns it', async () => {
    const probes = (uid: number, mode: number) => ({
      stat: async () => ({ uid, gid: 50, mode }),
      run: async (_command: string, args: string[]) =>
        args[0] === '-u'
          ? { code: 0, stdout: '990\n' }
          : { code: 0, stdout: '990 50\n' },
    });
    const shared = await checkCredentialIsolation({
      tokenFile: '/x/devbox-runner.env',
      otherUser: 'judge',
      probes: probes(1000, 0o100640),
    });
    const credentialFile = (list: typeof shared) =>
      list.find((finding) => finding.check === 'credentialFile');
    expect(credentialFile(shared)?.ok).toBe(false);
    const owned = await checkCredentialIsolation({
      tokenFile: '/x/devbox-runner.env',
      otherUser: 'judge',
      probes: probes(990, 0o100600),
    });
    expect(credentialFile(owned)?.ok).toBe(false);
  });
});
