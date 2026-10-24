import { dirname, join, sep } from 'node:path';
import {
  type DevboxIsolationFinding,
  type DevboxIsolationProbes,
  defaultIsolationProbes,
  isSymlinkMode,
} from './devbox-isolation';
import { createAclInspector } from './devbox-isolation-acl';

type FileInfo = { uid: number; gid: number; mode: number };
type Other = { name: string; uid: number; gids: Set<number> };

// Any of these makes an account root-equivalent (or able to become root), so
// it can read every credential regardless of file modes.
const PRIVILEGED_GROUPS = ['root', 'docker', 'sudo', 'wheel', 'admin', 'lxd'];
const ENV_TEMPLATE = /\.(example|sample|template)$/u;

const finding = (
  check: string,
  ok: boolean | undefined,
  detail: string
): DevboxIsolationFinding => ({
  check,
  ok: ok === true,
  status: ok === undefined ? 'unknown' : ok ? 'pass' : 'fail',
  detail,
});

// POSIX picks exactly one permission class: owner, else group, else other.
function accessFor(info: FileInfo, other: Other) {
  if (info.uid === other.uid) return (info.mode >> 6) & 0o7;
  if (other.gids.has(info.gid)) return (info.mode >> 3) & 0o7;
  return info.mode & 0o7;
}

// Whether `other` can reach a resolved path: every ancestor directory must
// grant it search (x) permission. Returns undefined when an ancestor cannot
// be inspected.
async function reachable(
  real: string,
  other: Other,
  probes: DevboxIsolationProbes
) {
  const ancestors: string[] = [];
  for (let path = dirname(real); ; path = dirname(path)) {
    ancestors.push(path);
    if (dirname(path) === path) break;
  }
  const infos = await Promise.all(
    ancestors.map((path) => probes.stat(path).catch(() => undefined))
  );
  if (infos.some((info) => !info)) return undefined;
  return infos.every((info) => (accessFor(info!, other) & 0o1) !== 0);
}

// Whether `other` can access a path (resolving symlinks first). Directories
// count as exposed on any access; files only when readable.
async function exposure(
  path: string,
  other: Other,
  probes: DevboxIsolationProbes,
  kind: 'directory' | 'file'
) {
  const real = await probes.realpath(path).catch(() => undefined);
  const info = real ? await probes.stat(real).catch(() => undefined) : null;
  if (!real || !info) return { real, exposed: undefined };
  const access = accessFor(info, other);
  if (kind === 'directory' ? access === 0 : (access & 0o4) === 0)
    return { real, info, exposed: false };
  const open = await reachable(real, other, probes);
  return { real, info, exposed: open };
}

async function envFiles(checkoutDir: string, probes: DevboxIsolationProbes) {
  const list = (dir: string) => probes.readdir(dir).catch(() => [] as string[]);
  const dirs = [checkoutDir];
  for (const group of ['apps', 'packages'])
    for (const name of await list(join(checkoutDir, group)))
      if (!name.startsWith('.')) dirs.push(join(checkoutDir, group, name));
  const files: string[] = [];
  for (const dir of dirs)
    for (const name of await list(dir))
      if (name.startsWith('.env') && !ENV_TEMPLATE.test(name))
        files.push(join(dir, name));
  return files;
}

// Proves a trusted credential is unreadable by a Judge (or any other) user:
// that user is not privileged, the token file and directory are real paths
// that deny it any access (modes and ACLs), and the runner's home, checkout
// and checkout `.env*` files are not reachable by it.
export async function checkCredentialIsolation({
  tokenFile,
  otherUser,
  home,
  checkoutDir,
  probes: overrides = {},
}: {
  tokenFile: string;
  otherUser: string;
  home?: string;
  checkoutDir?: string;
  probes?: Partial<DevboxIsolationProbes>;
}): Promise<DevboxIsolationFinding[]> {
  const probes = { ...defaultIsolationProbes, ...overrides };
  const inspectAcl = createAclInspector(probes);
  const aclFinding = async (label: string, path: string) => {
    const grants = await inspectAcl(path);
    return finding(
      `${label}Acl`,
      grants === undefined ? undefined : grants.length === 0,
      grants === undefined
        ? `cannot determine ACLs for ${path} and its ancestors`
        : grants.length
          ? `extended ACL grants: ${grants.join('; ')}`
          : `${path} and its ancestors have no effective extended ACL grants`
    );
  };
  const [account, groups, groupNames] = await Promise.all([
    probes.run('id', ['-u', otherUser]),
    probes.run('id', ['-G', otherUser]),
    probes.run('id', ['-Gn', otherUser]),
  ]);
  if (account.code !== 0 || groups.code !== 0)
    return [
      finding('otherUserExists', false, `cannot resolve user ${otherUser}`),
    ];
  const other: Other = {
    name: otherUser,
    uid: Number(account.stdout.trim()),
    gids: new Set(groups.stdout.trim().split(/\s+/u).map(Number)),
  };
  const names =
    groupNames.code === 0 ? groupNames.stdout.trim().split(/\s+/u) : undefined;
  const privileged = names?.filter((name) => PRIVILEGED_GROUPS.includes(name));
  const findings = [
    finding(
      'otherUserUnprivileged',
      other.uid === 0 || other.gids.has(0)
        ? false
        : privileged && privileged.length === 0,
      other.uid === 0 || other.gids.has(0)
        ? `${otherUser} is root or in the root group`
        : privileged === undefined
          ? `cannot list the group names of ${otherUser}`
          : privileged.length
            ? `${otherUser} is in root-equivalent group(s): ${privileged.join(', ')}`
            : `${otherUser} is not root and not in ${PRIVILEGED_GROUPS.join('/')}`
    ),
  ];

  for (const [label, path] of [
    ['credentialFile', tokenFile],
    ['credentialDirectory', dirname(tokenFile)],
  ] as const) {
    const info = await probes.stat(path).catch(() => undefined);
    const linked = info !== undefined && isSymlinkMode(info.mode);
    const ok =
      info !== undefined &&
      !linked &&
      info.uid !== other.uid &&
      (info.mode & 0o007) === 0 &&
      ((info.mode & 0o070) === 0 || !other.gids.has(info.gid));
    findings.push(
      finding(
        label,
        ok,
        !info
          ? `${path} is not readable by this process`
          : linked
            ? `${path} is a symlink; use the real private path`
            : `${path}: owner ${info.uid}, group ${info.gid}, mode ${(info.mode & 0o777).toString(8)}; ${otherUser} must have no owner, group or other access`
      )
    );
    findings.push(await aclFinding(label, path));
  }

  for (const [label, path] of [
    ['homeDirectory', home],
    ['checkoutDirectory', checkoutDir],
  ] as const) {
    if (!path) continue;
    findings.push(await aclFinding(label, path));
    const { real, info, exposed } = await exposure(
      path,
      other,
      probes,
      'directory'
    );
    findings.push(
      finding(
        label,
        exposed === undefined ? undefined : !exposed,
        exposed === undefined || !info
          ? `cannot inspect ${path} or its parent directories`
          : `${real}: mode ${(info.mode & 0o777).toString(8)}; ${otherUser} ${exposed ? 'can reach it' : 'cannot reach it'}`
      )
    );
  }

  if (checkoutDir) {
    const exposedFiles: string[] = [];
    let unknown = 0;
    const aclFindings: DevboxIsolationFinding[] = [];
    for (const file of await envFiles(checkoutDir, probes)) {
      aclFindings.push(await aclFinding('checkoutEnvFile', file));
      const { exposed } = await exposure(file, other, probes, 'file');
      if (exposed === undefined) unknown += 1;
      else if (exposed) exposedFiles.push(file.split(sep).slice(-2).join(sep));
    }
    findings.push(
      finding(
        'checkoutEnvFilesAcl',
        aclFindings.some((entry) => entry.status === 'fail')
          ? false
          : aclFindings.some((entry) => entry.status === 'unknown')
            ? undefined
            : true,
        aclFindings.map((entry) => entry.detail).join('; ') ||
          'no checkout .env files'
      ),
      finding(
        'checkoutEnvFiles',
        exposedFiles.length ? false : unknown ? undefined : true,
        exposedFiles.length
          ? `${otherUser} can read: ${exposedFiles.slice(0, 5).join(', ')}${exposedFiles.length > 5 ? ` and ${exposedFiles.length - 5} more` : ''}`
          : unknown
            ? `${unknown} .env file(s) could not be inspected`
            : `${otherUser} cannot read any checkout .env file`
      )
    );
  }
  return findings;
}
