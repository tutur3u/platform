import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

// Hold files: one absolute path or glob per line, `#` comments. A held path,
// everything beneath it and everything above it is never removed. This is
// the same contract the machine-cleanup owner tooling reads, so one hold
// protects a path from every cleanup tool on the machine.
export const defaultHoldsDir = join(homedir(), '.t3', 'cleanup', 'holds.d');

export interface Hold {
  path: string;
  owner: string;
  glob: boolean;
}

export function holdsDirs(
  env: NodeJS.ProcessEnv = process.env,
  flags: string[] = []
) {
  if (flags.length) return flags.map((dir) => resolve(dir));
  const fromEnv = env.TTR_STORAGE_HOLDS_DIRS?.split(':').filter(Boolean);
  return fromEnv?.length
    ? fromEnv.map((dir) => resolve(dir))
    : [defaultHoldsDir];
}

/**
 * A missing holds directory means "no holds". Any other read failure throws,
 * so destructive callers stop instead of treating unknown holds as none.
 */
export function readHolds(dirs: string[]): Hold[] {
  const holds: Hold[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir)
        .filter((name) => name.endsWith('.txt'))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(
        `Cannot read holds directory ${dir}: ${(error as Error).message}`
      );
    }
    for (const name of names) {
      const owner = basename(name, '.txt');
      for (const raw of readFileSync(join(dir, name), 'utf8').split('\n')) {
        let line = raw.replace(/#.*$/u, '').trim();
        if (!line) continue;
        if (line.startsWith('~/')) line = join(homedir(), line.slice(2));
        if (!isAbsolute(line)) continue;
        holds.push({ path: line, owner, glob: /[*?[]/u.test(line) });
      }
    }
  }
  return holds;
}

export function canonicalPath(input: string): string {
  const absolute = resolve(input);
  try {
    return realpathSync(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Sandboxed (EPERM/EACCES) paths keep their literal absolute form.
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return absolute;
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;
    return join(canonicalPath(parent), basename(absolute));
  }
}

export function isInside(child: string, parent: string) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Returns the owners of every hold that covers `target`. */
export function holdOwners(target: string, holds: Hold[]) {
  const path = canonicalPath(target);
  const owners = new Set<string>();
  for (const hold of holds) {
    if (hold.glob) {
      // Globs match conservatively by their literal directory prefix.
      const literal = hold.path.slice(0, hold.path.search(/[*?[]/u));
      const prefix = canonicalPath(
        literal.endsWith('/') ? literal : dirname(literal)
      );
      if (isInside(path, prefix) || isInside(prefix, path))
        owners.add(hold.owner);
      continue;
    }
    const held = canonicalPath(hold.path);
    if (isInside(path, held) || isInside(held, path)) owners.add(hold.owner);
  }
  return [...owners].sort();
}

export type CwdLister = () => { pid: number; cwd: string }[];

/** Working directories of every process this user can see (lsof). */
export const listProcessCwds: CwdLister = () => {
  const result = spawnSync(
    'lsof',
    ['-a', '-d', 'cwd', '-Fpn', '-u', String(process.getuid?.() ?? '')],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20_000,
    }
  );
  if (result.error)
    throw new Error(`lsof unavailable: ${result.error.message}`);
  const cwds: { pid: number; cwd: string }[] = [];
  let pid = 0;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n/')) cwds.push({ pid, cwd: line.slice(1) });
  }
  // Fail closed: a healthy listing always includes this process. Anything
  // else (killed, permission errors, empty output) must not read as idle.
  if (!cwds.some((entry) => entry.pid === process.pid))
    throw new Error(
      `lsof did not list process cwds (status ${result.status ?? result.signal}): ${result.stderr?.trim().slice(0, 200) || 'no output'}`
    );
  return cwds;
};

/**
 * True when another process works inside `target`. A cwd above it (like
 * $HOME) does not count; this process is ignored.
 */
export function isBusy(
  target: string,
  cwds: { pid: number; cwd: string }[],
  ignorePids: number[] = [process.pid]
) {
  const path = canonicalPath(target);
  return cwds.some(
    (entry) =>
      !ignorePids.includes(entry.pid) &&
      isInside(canonicalPath(entry.cwd), path)
  );
}
