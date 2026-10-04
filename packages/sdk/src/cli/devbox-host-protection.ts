import { realpath, stat } from 'node:fs/promises';
import { platform, userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { DevboxSetupCommandRunner } from './devbox-setup-command';

export type DevboxExecutionMode = 'trusted' | 'judge-only';
export function parseDevboxExecutionMode(value?: string): DevboxExecutionMode {
  if (value && !['trusted', 'judge-only'].includes(value))
    throw new Error('Use --execution-mode trusted or judge-only.');
  return (value ?? 'trusted') as DevboxExecutionMode;
}
export function protectedSystemdSettings(
  checkoutDir: string,
  wrapperPath: string,
  serviceHome: string
) {
  const paths = [checkoutDir, dirname(wrapperPath), serviceHome];
  if (paths.some((path) => /[\s%\n\r]/u.test(path)))
    throw new Error(
      'Protected service paths must not contain whitespace or systemd specifiers.'
    );
  return [
    'ProtectHome=yes',
    'ProtectSystem=strict',
    'PrivateTmp=yes',
    'PrivateDevices=yes',
    'CapabilityBoundingSet=',
    'AmbientCapabilities=',
    'ProtectKernelTunables=yes',
    'ProtectKernelModules=yes',
    'ProtectKernelLogs=yes',
    'ProtectControlGroups=yes',
    'ProtectClock=yes',
    'ProtectHostname=yes',
    'RestrictSUIDSGID=yes',
    'RestrictRealtime=yes',
    'LockPersonality=yes',
    'RestrictNamespaces=yes',
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
    'SystemCallArchitectures=native',
    `ReadWritePaths=${[...new Set(paths)].join(' ')}`,
  ];
}
export async function preflightProtectedService({
  mode,
  manager,
  serviceUser,
  checkoutDir,
  tokenFile,
  cliCommand,
  dockerHost,
  runCommand,
}: {
  mode: DevboxExecutionMode;
  manager: string;
  serviceUser: string;
  checkoutDir: string;
  tokenFile: string;
  cliCommand: string[];
  dockerHost?: string;
  runCommand: DevboxSetupCommandRunner;
}) {
  if (mode !== 'judge-only') return undefined;
  if (platform() !== 'linux' || manager !== 'systemd')
    throw new Error(
      'Protected Judge services require Linux systemd; use a dedicated Linux VM on other platforms.'
    );
  if (
    !/^[a-z_][a-z0-9_-]*[$]?$/u.test(serviceUser) ||
    ['root', userInfo().username].includes(serviceUser)
  )
    throw new Error(
      'Judge-only services require an existing dedicated non-root OS user, not your personal login.'
    );
  if (userInfo().uid !== 0)
    throw new Error(
      'Protected setup and repair must run as root with an authenticated operator CLI context; private service directories must not be opened to the operator group.'
    );
  if (!dockerHost?.startsWith('unix:///'))
    throw new Error(
      'Judge-only services require --docker-host unix:///path/to/dedicated/docker.sock.'
    );
  const socket = await realpath(dockerHost.slice('unix://'.length));
  if (['/var/run/docker.sock', '/run/docker.sock'].includes(socket))
    throw new Error(
      'The general Docker socket is forbidden for protected services.'
    );
  const account = await runCommand('getent', ['passwd', serviceUser], {
    json: true,
  });
  const fields = account.stdout.trim().split(':');
  const serviceHome = fields[5];
  if (
    account.code !== 0 ||
    fields[0] !== serviceUser ||
    !fields[2] ||
    fields[2] === '0' ||
    !serviceHome?.startsWith('/var/lib/') ||
    !['/usr/sbin/nologin', '/sbin/nologin', '/bin/false'].includes(
      fields[6] ?? ''
    )
  )
    throw new Error(
      'Protected service user needs a non-login shell and a private home under /var/lib.'
    );
  const groups = await runCommand('id', ['-nG', serviceUser], { json: true });
  if (
    groups.code !== 0 ||
    groups.stdout.trim().split(/\s+/u).includes('docker')
  )
    throw new Error(
      'Protected service user must not belong to the general docker group.'
    );
  for (const path of [
    checkoutDir,
    tokenFile,
    serviceHome,
    ...cliCommand.filter((arg) => arg.startsWith('/')),
  ]) {
    const normalized = resolve(path);
    if (normalized === '/' || /^\/(home|root)(\/|$)/u.test(normalized))
      throw new Error(
        'Protected services require checkout, token, CLI, and service home outside personal home directories.'
      );
  }
  const homePath = await realpath(serviceHome);
  const checkoutPath = await realpath(checkoutDir);
  const tokenDirectory = await realpath(dirname(tokenFile));
  if (
    !homePath.startsWith('/var/lib/') ||
    !checkoutPath.startsWith(`${homePath}/`) ||
    !tokenDirectory.startsWith(`${homePath}/`)
  )
    throw new Error(
      'Protected checkout and token directories must be inside the dedicated service home.'
    );
  const privateDirectory = await stat(tokenDirectory);
  if (
    !privateDirectory.isDirectory() ||
    privateDirectory.uid !== Number(fields[2]) ||
    (privateDirectory.mode & 0o077) !== 0
  )
    throw new Error(
      'Prepare the private token directory with the service user as owner and no access for other users before setup.'
    );
  const socketStat = await stat(socket);
  if (
    !socketStat.isSocket() ||
    socketStat.uid !== 0 ||
    socketStat.gid !== Number(fields[3]) ||
    (socketStat.mode & 0o060) !== 0o060 ||
    (socketStat.mode & 0o007) !== 0
  )
    throw new Error(
      'Dedicated Docker socket must be root-owned, restricted to the service user group, and inaccessible to other users.'
    );
  const docker = await runCommand(
    'docker',
    ['--host', dockerHost, 'info', '--format', '{{json .}}'],
    { json: true }
  );
  let info: {
    Runtimes?: Record<string, unknown>;
    DefaultRuntime?: string;
    CgroupDriver?: string;
    SecurityOptions?: string[];
  };
  try {
    info = JSON.parse(docker.stdout);
  } catch {
    throw new Error('Cannot verify dedicated Docker security settings.');
  }
  if (
    docker.code !== 0 ||
    !info.Runtimes?.runsc ||
    info.DefaultRuntime !== 'runsc' ||
    !info.CgroupDriver ||
    info.CgroupDriver === 'none' ||
    info.SecurityOptions?.some((value) => value.includes('rootless'))
  )
    throw new Error(
      'Dedicated Docker must default to gVisor runsc with enforced cgroup limits.'
    );
  return serviceHome;
}
