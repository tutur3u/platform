import { execFile } from 'node:child_process';
import { readdir, realpath, stat } from 'node:fs/promises';
import { platform, userInfo } from 'node:os';
import { dirname } from 'node:path';

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
export interface DevboxIsolationFinding {
  check: string;
  ok: boolean;
  detail: string;
}

type FileInfo = { uid: number; gid: number; mode: number };
export interface DevboxIsolationProbes {
  env: NodeJS.ProcessEnv;
  platform: string;
  user: () => { uid: number; username: string };
  stat: (path: string) => Promise<FileInfo>;
  realpath: (path: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  run: (
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv
  ) => Promise<{ code: number; stdout: string }>;
}

const defaultProbes: DevboxIsolationProbes = {
  env: process.env,
  platform: platform(),
  user: () => ({ uid: userInfo().uid, username: userInfo().username }),
  stat: async (path) => {
    const info = await stat(path);
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

// Checks what this process (normally the runner service) can observe about
// its own isolation. Results are self-reported: useful evidence for operators,
// never an authorization input.
export async function collectDevboxIsolation({
  tokenFile,
  serviceUser,
  probes: overrides = {},
}: {
  tokenFile?: string;
  serviceUser?: string;
  probes?: Partial<DevboxIsolationProbes>;
} = {}) {
  const probes = { ...defaultProbes, ...overrides };
  const findings: DevboxIsolationFinding[] = [];
  const summary: DevboxIsolationSummary = {
    checkedAt: new Date().toISOString(),
  };
  const record = (
    check: keyof Omit<DevboxIsolationSummary, 'checkedAt'>,
    ok: boolean | undefined,
    detail: string
  ) => {
    if (ok === undefined) return;
    summary[check] = ok;
    findings.push({ check, ok, detail });
  };

  const user = probes.user();
  const expectedUser = serviceUser ?? probes.env.TUTURUUU_DEVBOX_SERVICE_USER;
  record(
    'dedicatedUser',
    user.uid !== 0 &&
      (expectedUser ? user.username === expectedUser : undefined),
    expectedUser
      ? `running as ${user.username}; expected dedicated user ${expectedUser}`
      : 'no dedicated service user is configured'
  );

  const token = tokenFile ?? probes.env.TUTURUUU_DEVBOX_TOKEN_FILE;
  if (token) {
    const [file, directory] = await Promise.all([
      probes.stat(token).catch(() => undefined),
      probes.stat(dirname(token)).catch(() => undefined),
    ]);
    record(
      'privateTokenDirectory',
      file && directory
        ? file.uid === user.uid &&
            directory.uid === user.uid &&
            privateMode(file.mode) &&
            privateMode(directory.mode)
        : false,
      file && directory
        ? 'token file and directory must be owned by the runner user with no group/other access'
        : 'token file or its directory is not readable by this process'
    );
  }

  if (probes.platform === 'linux') {
    const home = await probes.readdir('/home').catch(() => [] as string[]);
    record(
      'protectedService',
      Boolean(probes.env.INVOCATION_ID) && home.length === 0,
      'systemd service with ProtectHome hiding personal home directories'
    );
  }

  const dockerHost = probes.env.DOCKER_HOST;
  if (dockerHost?.startsWith('unix://')) {
    const socket = await probes
      .realpath(dockerHost.slice('unix://'.length))
      .catch(() => undefined);
    record(
      'dedicatedDockerSocket',
      socket ? !GENERAL_DOCKER_SOCKETS.includes(socket) : false,
      'DOCKER_HOST must point to a dedicated socket, not the general daemon'
    );
  }

  const runtime = await probes.run(
    'docker',
    ['info', '--format', '{{.DefaultRuntime}}'],
    probes.env
  );
  if (runtime.code === 0)
    record(
      'gvisorDefault',
      runtime.stdout.trim() === 'runsc',
      'the reachable Docker daemon must default to gVisor runsc'
    );

  const groups = await probes.run('id', ['-nG']);
  if (groups.code === 0)
    record(
      'noGeneralDockerGroup',
      !groups.stdout.trim().split(/\s+/u).includes('docker'),
      'membership in the docker group is root-equivalent on the host'
    );

  return { summary, findings };
}

// Proves a trusted credential is unreadable by a Judge (or any other) user:
// the token file and directory deny group/other access and are not owned by
// or shared through a group with that user.
export async function checkCredentialIsolation({
  tokenFile,
  otherUser,
  probes: overrides = {},
}: {
  tokenFile: string;
  otherUser: string;
  probes?: Partial<DevboxIsolationProbes>;
}): Promise<DevboxIsolationFinding[]> {
  const probes = { ...defaultProbes, ...overrides };
  const account = await probes.run('id', ['-u', otherUser]);
  const groups = await probes.run('id', ['-G', otherUser]);
  if (account.code !== 0 || groups.code !== 0)
    return [
      {
        check: 'otherUserExists',
        ok: false,
        detail: `cannot resolve user ${otherUser}`,
      },
    ];
  const otherUid = Number(account.stdout.trim());
  const otherGroups = new Set(groups.stdout.trim().split(/\s+/u).map(Number));
  const findings: DevboxIsolationFinding[] = [];
  for (const [label, path] of [
    ['credentialFile', tokenFile],
    ['credentialDirectory', dirname(tokenFile)],
  ] as const) {
    const info = await probes.stat(path).catch(() => undefined);
    const ok =
      info !== undefined &&
      info.uid !== otherUid &&
      (info.mode & 0o007) === 0 &&
      ((info.mode & 0o070) === 0 || !otherGroups.has(info.gid));
    findings.push({
      check: label,
      ok,
      detail: info
        ? `${path}: owner ${info.uid}, group ${info.gid}, mode ${(info.mode & 0o777).toString(8)}; ${otherUser} must have no owner, group or other access`
        : `${path} is not readable by this process`,
    });
  }
  return findings;
}
