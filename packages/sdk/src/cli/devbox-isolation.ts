import { execFile } from 'node:child_process';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { platform, userInfo } from 'node:os';
import { dirname } from 'node:path';
import type { DevboxExecutionMode } from './devbox-host-protection';

/** Matches the advisory `isolation` heartbeat contract (closed key set). */
export interface DevboxIsolationSummary {
  checkedAt: string;
  dedicatedUser?: boolean;
  privateTokenDirectory?: boolean;
  protectedService?: boolean;
  dedicatedDockerSocket?: boolean;
  gvisorDefault?: boolean;
  noGeneralDockerGroup?: boolean;
}
export type DevboxIsolationCheck = keyof Omit<
  DevboxIsolationSummary,
  'checkedAt'
>;
export type DevboxIsolationStatus = 'pass' | 'fail' | 'unknown';
export interface DevboxIsolationFinding {
  check: string;
  /** True only when the check was proven (`status === 'pass'`). */
  ok: boolean;
  status: DevboxIsolationStatus;
  /** Advisory evidence is reported but never decides the doctor result. */
  advisory?: boolean;
  detail: string;
}

type FileInfo = { uid: number; gid: number; mode: number };
export interface DevboxIsolationProbes {
  env: NodeJS.ProcessEnv;
  platform: string;
  user: () => { uid: number; username: string };
  /** Must not follow symlinks (lstat); `mode` includes the file type bits. */
  stat: (path: string) => Promise<FileInfo>;
  realpath: (path: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  run: (
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv
  ) => Promise<{ code: number; stdout: string }>;
}

export const defaultIsolationProbes: DevboxIsolationProbes = {
  env: process.env,
  platform: platform(),
  user: () => ({ uid: userInfo().uid, username: userInfo().username }),
  stat: async (path) => {
    const info = await lstat(path);
    return { uid: info.uid, gid: info.gid, mode: info.mode };
  },
  realpath,
  readdir,
  run: (command, args, env) =>
    new Promise((resolve) => {
      execFile(
        command,
        args,
        { env, timeout: 5000, maxBuffer: 1024 * 1024 },
        (error, stdout) =>
          resolve({
            code: error ? Number((error as { code?: number }).code ?? 1) : 0,
            stdout: String(stdout),
          })
      );
    }),
};
const GENERAL_DOCKER_SOCKETS = ['/var/run/docker.sock', '/run/docker.sock'];
const privateMode = (mode: number) => (mode & 0o077) === 0;
export const isSymlinkMode = (mode: number) => (mode & 0o170000) === 0o120000;

// The minimum each execution mode must prove before `doctor --isolation`
// passes. Anything else is reported but only fails when it is proven false.
export const DEVBOX_ISOLATION_REQUIRED: Record<
  DevboxExecutionMode,
  readonly DevboxIsolationCheck[]
> = {
  trusted: ['dedicatedUser', 'privateTokenDirectory'],
  'judge-only': [
    'dedicatedUser',
    'privateTokenDirectory',
    'dedicatedDockerSocket',
    'gvisorDefault',
    'noGeneralDockerGroup',
  ],
};
const ADVISORY_CHECKS: readonly string[] = ['protectedService'];

// Checks what this process (normally the runner service) can observe about
// its own isolation. Results are self-reported: useful evidence for operators,
// never an authorization input. Checks that cannot be determined are reported
// as `unknown` and are omitted from the heartbeat summary.
export async function collectDevboxIsolation({
  tokenFile,
  serviceUser,
  probes: overrides = {},
}: {
  tokenFile?: string;
  serviceUser?: string;
  probes?: Partial<DevboxIsolationProbes>;
} = {}) {
  const probes = { ...defaultIsolationProbes, ...overrides };
  const findings: DevboxIsolationFinding[] = [];
  const summary: DevboxIsolationSummary = {
    checkedAt: new Date().toISOString(),
  };
  const record = (
    check: DevboxIsolationCheck,
    ok: boolean | undefined,
    detail: string
  ) => {
    if (ok !== undefined) summary[check] = ok;
    findings.push({
      check,
      ok: ok === true,
      status: ok === undefined ? 'unknown' : ok ? 'pass' : 'fail',
      ...(ADVISORY_CHECKS.includes(check) ? { advisory: true } : {}),
      detail,
    });
  };

  const user = probes.user();
  const expectedUser = serviceUser ?? probes.env.TUTURUUU_DEVBOX_SERVICE_USER;
  record(
    'dedicatedUser',
    user.uid === 0
      ? false
      : expectedUser
        ? user.username === expectedUser
        : undefined,
    expectedUser
      ? `running as ${user.username}; expected dedicated user ${expectedUser}`
      : user.uid === 0
        ? 'running as root'
        : 'no dedicated service user is configured'
  );

  const token = tokenFile ?? probes.env.TUTURUUU_DEVBOX_TOKEN_FILE;
  if (token) {
    const [file, directory] = await Promise.all([
      probes.stat(token).catch(() => undefined),
      probes.stat(dirname(token)).catch(() => undefined),
    ]);
    const linked =
      (file && isSymlinkMode(file.mode)) ||
      (directory && isSymlinkMode(directory.mode));
    record(
      'privateTokenDirectory',
      file && directory && !linked
        ? file.uid === user.uid &&
            directory.uid === user.uid &&
            privateMode(file.mode) &&
            privateMode(directory.mode)
        : false,
      linked
        ? 'token file or directory is a symlink; point the runner at the real private path'
        : file && directory
          ? 'token file and directory must be owned by the runner user with no group/other access'
          : 'token file or its directory is not readable by this process'
    );
  } else
    record('privateTokenDirectory', undefined, 'no runner token file is set');

  if (probes.platform === 'linux') {
    const home = await probes.readdir('/home').then(
      (entries) => ({ entries }),
      (error: NodeJS.ErrnoException) => ({ error: error?.code ?? 'error' })
    );
    const systemd = Boolean(probes.env.INVOCATION_ID);
    record(
      'protectedService',
      !systemd
        ? false
        : 'entries' in home
          ? home.entries.length === 0
          : undefined,
      !systemd
        ? 'advisory: not running as a systemd service'
        : 'entries' in home
          ? 'advisory: systemd service with ProtectHome hiding personal home directories'
          : `advisory: cannot list /home (${home.error}); ProtectHome cannot be told apart from ordinary permissions`
    );
  } else
    record(
      'protectedService',
      undefined,
      'advisory: ProtectHome evidence is only collected on Linux'
    );

  const runtime = await probes.run(
    'docker',
    ['info', '--format', '{{.DefaultRuntime}}'],
    probes.env
  );
  const dockerHost = probes.env.DOCKER_HOST?.trim();
  if (dockerHost?.startsWith('unix://')) {
    const [socket, ...general] = await Promise.all(
      [dockerHost.slice('unix://'.length), ...GENERAL_DOCKER_SOCKETS].map(
        (path) => probes.realpath(path).catch(() => undefined)
      )
    );
    record(
      'dedicatedDockerSocket',
      socket
        ? ![...GENERAL_DOCKER_SOCKETS, ...general].includes(socket)
        : false,
      'DOCKER_HOST must point to a dedicated socket, not the general daemon'
    );
  } else if (dockerHost)
    record(
      'dedicatedDockerSocket',
      undefined,
      `DOCKER_HOST uses ${dockerHost.split(':')[0]}, not a local unix socket; it cannot be proven dedicated`
    );
  else
    record(
      'dedicatedDockerSocket',
      runtime.code === 0 ? false : undefined,
      runtime.code === 0
        ? 'DOCKER_HOST is unset, so the reachable daemon is the general Docker socket'
        : 'DOCKER_HOST is unset and no Docker daemon is reachable'
    );

  record(
    'gvisorDefault',
    runtime.code === 0 ? runtime.stdout.trim() === 'runsc' : undefined,
    runtime.code === 0
      ? 'the reachable Docker daemon must default to gVisor runsc'
      : 'no Docker daemon is reachable; the default runtime is unknown'
  );

  const groups = await probes.run('id', ['-nG']);
  record(
    'noGeneralDockerGroup',
    groups.code === 0
      ? !groups.stdout.trim().split(/\s+/u).includes('docker')
      : undefined,
    groups.code === 0
      ? 'membership in the docker group is root-equivalent on the host'
      : 'cannot list the groups of this account'
  );

  return { summary, findings };
}

// A doctor result passes only when every non-advisory check that ran is not
// proven false and every check the mode requires is proven true.
export function evaluateDevboxIsolation(
  findings: DevboxIsolationFinding[],
  mode: DevboxExecutionMode,
  extraRequired: readonly string[] = []
) {
  const required = new Set<string>([
    ...DEVBOX_ISOLATION_REQUIRED[mode],
    ...extraRequired,
  ]);
  const missing = [...required].filter(
    (check) =>
      !findings.some(
        (finding) => finding.check === check && finding.status === 'pass'
      )
  );
  const failed = findings.filter(
    (finding) => finding.status === 'fail' && !finding.advisory
  );
  return {
    ok: missing.length === 0 && failed.length === 0,
    required: [...required],
    missing,
  };
}

export { checkCredentialIsolation } from './devbox-isolation-credential';
