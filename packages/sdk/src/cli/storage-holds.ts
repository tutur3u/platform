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
// protects a path from every cleanup tool on the machine. Every regular file
// in a holds directory counts (tuturuuu.txt, upskii.txt, mastermind.txt and
// any other project's), whatever its extension: an unexpected name must widen
// protection, never silently drop it.
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
  // Extra directories add holds; they never replace the shared default.
  const fromEnv = env.TTR_STORAGE_HOLDS_DIRS?.split(':').filter(Boolean) ?? [];
  return [
    ...new Set(
      [defaultHoldsDir, ...fromEnv, ...flags].map((dir) => resolve(dir))
    ),
  ];
}

/**
 * A missing holds directory means "no holds". Any other read failure, and any
 * non-comment line that is not an absolute path or glob, throws with the file
 * and line: destructive callers stop instead of guessing what a malformed
 * hold meant.
 */
/** Editor and OS scratch files in a holds directory, never read as holds. */
export const ignoredHoldFile = (name: string) =>
  name.startsWith('.') || name.endsWith('~') || /\.sw[a-p]$/u.test(name);

export function readHolds(
  dirs: string[],
  warn: (message: string) => void = (message) =>
    process.stderr.write(`[ttr storage] ${message}\n`)
): Hold[] {
  const holds: Hold[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => !entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(
        `Cannot read holds directory ${dir}: ${(error as Error).message}`
      );
    }
    for (const name of names) {
      if (ignoredHoldFile(name)) {
        warn(
          `ignoring ${join(dir, name)} (dotfile or editor swap/backup); move real holds into a project file`
        );
        continue;
      }
      const owner = basename(name).replace(/\.[^.]*$/u, '') || name;
      const file = join(dir, name);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((raw, index) => {
          let line = raw.replace(/#.*$/u, '').trim();
          if (!line) return;
          if (line.startsWith('~/')) line = join(homedir(), line.slice(2));
          if (!isAbsolute(line) || line.includes('\0'))
            throw new Error(
              `Invalid hold in ${file}:${index + 1}: "${raw.trim().slice(0, 120)}" is not an absolute path or glob; fix or comment it out before any cleanup runs.`
            );
          holds.push({ path: line, owner, glob: /[*?[]/u.test(line) });
        });
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
