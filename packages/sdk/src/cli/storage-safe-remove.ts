import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { canonicalPath } from './storage-holds';

// Identity-anchored tree removal. The directory chain from a rule root down to
// the target is captured as (dev, inode) pairs before the safety checks run,
// and re-verified at the destructive boundary: before the walk, and again
// before every unlink and rmdir. Nothing is followed through a symlink (a
// symlink inside the tree is unlinked as a link), a directory on another
// device (a mount, bind mount or mounted symlink target) refuses the whole
// removal before anything is deleted, and only entries seen by the pre-scan
// are deleted: anything created later makes its directory's rmdir fail.
//
// Every entry in the tree must be owned by the effective user and no
// directory may be group- or world-writable (mode & 0o022), both in the
// pre-scan and in the re-check before each unlink/rmdir: another user could
// otherwise plant or swap entries inside the tree. Running as root therefore
// removes only trees whose every entry is root-owned.
//
// Node has no openat/unlinkat, so a same-user process racing between a
// verification and the syscall right after it is narrowed, not eliminated.

export interface FsOps {
  lstat: (path: string) => {
    dev: number;
    ino: number;
    uid: number;
    mode: number;
    isDirectory: () => boolean;
    isSymbolicLink: () => boolean;
  };
  readdir: (path: string) => string[];
  unlink: (path: string) => void;
  rmdir: (path: string) => void;
}

export const realFsOps: FsOps = {
  lstat: (path) => lstatSync(path),
  readdir: (path) => readdirSync(path),
  unlink: (path) => unlinkSync(path),
  rmdir: (path) => rmdirSync(path),
};

interface Link {
  path: string;
  dev: number;
  ino: number;
}

export interface TreeIdentity {
  root: string;
  target: string;
  /** Root first, target last. */
  chain: Link[];
  /**
   * Refuse the whole removal when the pre-delete walk finds a git checkout
   * (`.git` directory or worktree file) or bare repository anywhere inside.
   * The check is part of the scan that defines what is deleted, so a
   * repository moved in after earlier checks is either seen here or created
   * after the scan, which only makes its parent's rmdir fail.
   */
  refuseRepositories?: boolean;
}

/**
 * Captures the identity of `target` under `root`. Throws when the target is
 * the root, lies outside it, or any component below the root is not a real
 * directory on the root's device.
 */
export function captureIdentity(
  root: string,
  target: string,
  fs: FsOps = realFsOps
): TreeIdentity {
  const base = canonicalPath(root);
  // Canonicalize the parent only: a symlinked target must not be resolved.
  const path = join(canonicalPath(dirname(target)), basename(target));
  const rel = relative(base, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new Error(`${target} is not strictly inside ${root}`);
  const chain: Link[] = [];
  let current = base;
  const parts = ['', ...rel.split(sep)];
  for (const part of parts) {
    current = part ? join(current, part) : current;
    const info = fs.lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(`${current} is not a real directory`);
    if (chain.length && info.dev !== chain[0]!.dev)
      throw new Error(`${current} is on another device (mount boundary)`);
    chain.push({ path: current, dev: info.dev, ino: info.ino });
  }
  return { root: base, target: path, chain };
}

function verifyChain(identity: TreeIdentity, fs: FsOps) {
  for (const link of identity.chain) {
    let info: ReturnType<FsOps['lstat']>;
    try {
      info = fs.lstat(link.path);
    } catch (error) {
      throw new Error(
        `identity check failed at ${link.path}: ${(error as Error).message}`
      );
    }
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      info.dev !== link.dev ||
      info.ino !== link.ino
    )
      throw new Error(
        `identity changed at ${link.path} since it was verified; nothing removed there`
      );
  }
}

interface Node {
  path: string;
  dev: number;
  ino: number;
  files: { path: string; dev: number; ino: number }[];
  dirs: Node[];
}

const effectiveUid = () => process.geteuid?.() ?? process.getuid?.() ?? -1;

/** Why an entry may not be removed by this user, or null. */
function ownershipProblem(
  path: string,
  info: ReturnType<FsOps['lstat']>,
  euid: number
) {
  if (euid < 0) return `${path}: effective uid unknown`;
  if (info.uid !== euid)
    return `${path} is owned by uid ${info.uid}, not the effective uid ${euid}`;
  if (info.isDirectory() && !info.isSymbolicLink() && info.mode & 0o022)
    return `${path} is group- or world-writable (mode ${(info.mode & 0o7777).toString(8)})`;
  return null;
}

/** Removes exactly the tree captured by `identity`; returns entries removed. */
export function removeVerifiedTree(
  identity: TreeIdentity,
  fs: FsOps = realFsOps,
  euid: number = effectiveUid()
) {
  verifyChain(identity, fs);
  const rootDev = identity.chain[0]!.dev;
  const target = identity.chain.at(-1)!;
  const owned = (path: string, info: ReturnType<FsOps['lstat']>) => {
    const problem = ownershipProblem(path, info, euid);
    if (problem) throw new Error(`${problem}; refusing the whole removal`);
  };
  owned(target.path, fs.lstat(target.path));
  const scan = (link: Link): Node => {
    const node: Node = { ...link, files: [], dirs: [] };
    const names = fs.readdir(link.path);
    if (
      identity.refuseRepositories &&
      (names.includes('.git') ||
        ['HEAD', 'objects', 'refs'].every((name) => names.includes(name)))
    )
      throw new Error(
        `${link.path} contains a git repository; refusing the whole removal`
      );
    for (const name of names) {
      const path = join(link.path, name);
      const info = fs.lstat(path);
      owned(path, info);
      if (info.isDirectory() && !info.isSymbolicLink()) {
        if (info.dev !== rootDev)
          throw new Error(
            `${path} is on another device (mount boundary); refusing the whole removal`
          );
        node.dirs.push(scan({ path, dev: info.dev, ino: info.ino }));
      } else node.files.push({ path, dev: info.dev, ino: info.ino });
    }
    return node;
  };
  // Pre-scan everything before deleting anything.
  const tree = scan(target);
  let removed = 0;
  const same = (link: Link) => {
    const info = fs.lstat(link.path);
    return (
      info.dev === link.dev &&
      info.ino === link.ino &&
      ownershipProblem(link.path, info, euid) === null
    );
  };
  const remove = (node: Node) => {
    for (const dir of node.dirs) remove(dir);
    verifyChain(identity, fs);
    if (!same(node) || fs.lstat(node.path).isSymbolicLink())
      throw new Error(`identity changed at ${node.path}; stopped`);
    for (const file of node.files) {
      if (!same(node))
        throw new Error(`identity changed at ${node.path}; stopped`);
      if (!same(file))
        throw new Error(`identity changed at ${file.path}; stopped`);
      fs.unlink(file.path);
      removed += 1;
    }
    fs.rmdir(node.path);
    removed += 1;
  };
  remove(tree);
  return removed;
}

/** Captures and removes in one step (callers that check nothing in between). */
export const removeTreeUnder = (root: string, target: string) =>
  removeVerifiedTree(captureIdentity(root, target));
