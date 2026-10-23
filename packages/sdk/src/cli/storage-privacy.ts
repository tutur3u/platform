import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalPath, isInside } from './storage-holds';

// Private-tree proof (macOS only, never as root). A non-root user cannot see
// other users' (or root's) processes with lsof, so their working directories
// and open files cannot be checked directly. A tree is still provably out of
// reach of every other non-root user when some directory at or above the
// rule root is owned by this user, has no group/other permissions
// (mode & 0o077 == 0) and no ACL, and every directory from there down to the
// item is owned by this user and not group- or other-writable, all on one
// device. Root's processes remain uninspectable; the orchestrator accepted
// that residual for this narrow case. Linux stays fail-closed until a
// container-mount check exists.

export type PrivacyProof =
  | { ok: true; anchor: string; evidence: 'private-tree' }
  | { ok: false; reason: string };

export interface PrivacyFs {
  lstat: (path: string) => {
    dev: number;
    uid: number;
    mode: number;
    isDirectory: () => boolean;
    isSymbolicLink: () => boolean;
  };
  /** Whether the path has an ACL; throws when that cannot be determined. */
  hasAcl: (path: string) => boolean;
}

export const realPrivacyFs: PrivacyFs = {
  lstat: (path) => lstatSync(path),
  hasAcl: (path) => {
    // `ls -lde` prints one line per ACL entry after the file's own line.
    const result = spawnSync('/bin/ls', ['-lde', path], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (result.error || result.signal || result.status !== 0)
      throw new Error(`cannot read the ACL of ${path}`);
    return result.stdout.trim().split('\n').length > 1;
  },
};

/** Directories from `top` down to `path`, inclusive. */
function chainBetween(top: string, path: string) {
  const chain: string[] = [];
  for (let current = path; ; current = dirname(current)) {
    chain.unshift(current);
    if (current === top || dirname(current) === current) break;
  }
  return chain;
}

export function privateTreeProof(
  path: string,
  root: string,
  {
    euid = process.geteuid?.() ?? -1,
    platform = process.platform,
    fs = realPrivacyFs,
  }: { euid?: number; platform?: NodeJS.Platform; fs?: PrivacyFs } = {}
): PrivacyProof {
  if (platform !== 'darwin')
    return { ok: false, reason: 'private-tree proof is macOS-only' };
  if (euid <= 0)
    return {
      ok: false,
      reason: 'private-tree proof is never used when running as root',
    };
  const target = canonicalPath(path);
  const base = canonicalPath(root);
  if (!isInside(target, base))
    return { ok: false, reason: `${path} is not inside its rule root` };
  try {
    // The nearest qualifying anchor at or above the rule root.
    let anchor: string | null = null;
    for (let current = base; ; current = dirname(current)) {
      const info = fs.lstat(current);
      if (
        info.isDirectory() &&
        !info.isSymbolicLink() &&
        info.uid === euid &&
        (info.mode & 0o077) === 0 &&
        !fs.hasAcl(current)
      ) {
        anchor = current;
        break;
      }
      if (dirname(current) === current) break;
    }
    if (!anchor)
      return {
        ok: false,
        reason: `no directory at or above ${root} is owned by uid ${euid} with mode 0700 and no ACL`,
      };
    const device = fs.lstat(anchor).dev;
    for (const component of chainBetween(anchor, target)) {
      const info = fs.lstat(component);
      if (info.isSymbolicLink())
        return { ok: false, reason: `${component} is a symlink` };
      if (info.uid !== euid)
        return {
          ok: false,
          reason: `${component} is owned by uid ${info.uid}, not ${euid}`,
        };
      if (info.mode & 0o022)
        return {
          ok: false,
          reason: `${component} is group- or other-writable`,
        };
      if (info.dev !== device)
        return { ok: false, reason: `${component} is on another device` };
    }
    return { ok: true, anchor, evidence: 'private-tree' };
  } catch (error) {
    return {
      ok: false,
      reason: `private-tree proof failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
