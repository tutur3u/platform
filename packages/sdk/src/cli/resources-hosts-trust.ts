import { constants, type Stats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { canonical, contains, readResourceConfig } from './resources-config';
import { errno } from './resources-slots';

// hosts.json decides where code runs, so it is trusted only from the
// canonical per-user resources home. That home must be a real 0700 directory
// owned by this user, the file a real 0600 file owned by this user, and every
// ancestor must be non-symlink and writable only by root or this user (a
// root-owned sticky directory such as /tmp is allowed as an ancestor). A
// TTR_RESOURCES_HOME pointing anywhere else ignores the registry.
export function canonicalResourcesHome() {
  return resolve(join(homedir(), '.tuturuuu', 'resources'));
}
export interface RegistryTrustOptions {
  canonicalHome?: string;
  uid?: number;
}
export class UntrustedRegistryError extends Error {
  constructor(reason: string) {
    super(`hosts.json is ignored and --hosts is disabled: ${reason}.`);
    this.name = 'UntrustedRegistryError';
  }
}
const currentUid = () => process.getuid?.() ?? -1;
const permissions = (info: Stats) => info.mode & 0o7777;

async function checkAncestors(path: string, uid: number) {
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    const info = await lstat(dir);
    if (info.isSymbolicLink())
      throw new UntrustedRegistryError(
        'a parent of the resources home is a symlink'
      );
    if (!info.isDirectory())
      throw new UntrustedRegistryError(
        'a parent of the resources home is not a directory'
      );
    if (info.uid !== 0 && info.uid !== uid)
      throw new UntrustedRegistryError(
        'a parent of the resources home is owned by another user'
      );
    const sticky = (info.mode & 0o1000) !== 0;
    if ((info.mode & 0o022) !== 0 && !(info.uid === 0 && sticky))
      throw new UntrustedRegistryError(
        'a parent of the resources home is group- or world-writable'
      );
    if (dir === dirname(dir)) return;
  }
}

/**
 * Reads hosts.json only when it is trusted; returns undefined when absent.
 * The file is opened with O_NOFOLLOW and re-verified through the open
 * descriptor, so it cannot be swapped between the checks and the read.
 */
export async function readTrustedRegistryText(
  home: string,
  {
    canonicalHome = canonicalResourcesHome(),
    uid = currentUid(),
  }: RegistryTrustOptions = {}
) {
  if (resolve(home) !== resolve(canonicalHome))
    throw new UntrustedRegistryError(
      'TTR_RESOURCES_HOME is not the canonical per-user resources home'
    );
  // A home inside an opted-in project would let that project's checkout (or
  // anything it writes) supply the registry.
  let config: Awaited<ReturnType<typeof readResourceConfig>>;
  try {
    config = await readResourceConfig(home);
  } catch {
    throw new UntrustedRegistryError('config.json is invalid');
  }
  const projects = [
    ...(config?.roots ?? []),
    ...(config?.repositories ?? []).map((repository) => dirname(repository)),
  ];
  if (projects.some((root) => contains(canonical(root), resolve(home))))
    throw new UntrustedRegistryError(
      'the resources home is inside an opted-in repository root'
    );
  const path = join(resolve(home), 'hosts.json');
  let file: Stats;
  try {
    file = await lstat(path);
  } catch (error) {
    if (errno(error, 'ENOENT')) return undefined;
    throw new UntrustedRegistryError('hosts.json cannot be inspected');
  }
  await checkAncestors(resolve(home), uid);
  const directory = await lstat(resolve(home));
  if (
    directory.isSymbolicLink() ||
    !directory.isDirectory() ||
    directory.uid !== uid ||
    permissions(directory) !== 0o700
  )
    throw new UntrustedRegistryError(
      'the resources home must be a 0700 directory owned by you'
    );
  const fileOk = (info: Stats) =>
    info.isFile() && info.uid === uid && permissions(info) === 0o600;
  if (file.isSymbolicLink() || !fileOk(file))
    throw new UntrustedRegistryError(
      'hosts.json must be a regular 0600 file owned by you, not a symlink'
    );
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new UntrustedRegistryError('hosts.json could not be opened safely');
  }
  try {
    const opened = await handle.stat();
    if (!fileOk(opened) || opened.ino !== file.ino || opened.dev !== file.dev)
      throw new UntrustedRegistryError(
        'hosts.json changed while it was checked'
      );
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}
