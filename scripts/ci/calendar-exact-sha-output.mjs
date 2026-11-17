// Output-tree guards for the Calendar exact-SHA stage path. The tree is
// checked by name and lstat before any file content is read or uploaded.
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

import { stop } from './calendar-exact-sha-stop.mjs';

const SEAL = /^[a-f0-9]{64}$/u;

// Returns the guardCode for a refused entry name, or '' when it is allowed.
export function sensitiveNameCode(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith('.env')) return 'OUTPUT_ENV_FILE';
  if (lower === '.vercel') return 'OUTPUT_NESTED_VERCEL';
  if (lower.endsWith('.pem') || lower.endsWith('.key')) {
    return 'OUTPUT_KEY_FILE';
  }
  return '';
}

export function assertSafeName(name) {
  const code = sensitiveNameCode(name);
  if (code) throw stop(code, 'sensitive output path refused');
}

export function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

const realFs = {
  lstat: lstatSync,
  readdir: readdirSync,
  realpath: realpathSync,
};

// Walks the tree without following links: refuses sensitive names, symlinks
// at any depth, special files, and any entry whose real path leaves the root.
export function assertSafeOutputTree(rootDir, fs = realFs) {
  let rootStat;
  try {
    rootStat = fs.lstat(rootDir);
  } catch {
    throw stop('OUTPUT_MISSING', 'Legacy Vercel output is missing');
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw stop('OUTPUT_ROOT_INVALID', 'output root is not a real directory');
  }
  const root = fs.realpath(rootDir);
  const paths = [];
  const walk = (dir) => {
    for (const name of fs.readdir(dir)) {
      assertSafeName(name);
      const abs = path.join(dir, name);
      const stat = fs.lstat(abs);
      if (stat.isSymbolicLink()) {
        throw stop('OUTPUT_SYMLINK', 'output symlink refused');
      }
      if (!isContained(root, fs.realpath(abs))) {
        throw stop('OUTPUT_OUTSIDE_ROOT', 'output path leaves the output root');
      }
      if (stat.isDirectory()) walk(abs);
      else if (stat.isFile()) {
        paths.push(path.relative(root, abs).split(path.sep).join('/'));
      } else {
        throw stop('OUTPUT_SPECIAL_FILE', 'output special file refused');
      }
    }
  };
  walk(root);
  return paths.sort();
}

const readOnlyNoFollow =
  constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// Hashes each file through the descriptor it opened. A later read of the path
// could follow a symlink swapped in after the tree check.
export function listOutput(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      assertSafeName(name);
      const abs = path.join(dir, name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      let fd;
      try {
        fd = openSync(abs, readOnlyNoFollow);
      } catch (error) {
        if (error?.code === 'ELOOP' || error?.code === 'EINVAL') {
          throw stop('OUTPUT_SYMLINK', 'output symlink refused');
        }
        throw error;
      }
      try {
        const stat = fstatSync(fd);
        if (stat.isDirectory()) walk(abs);
        else if (stat.isFile()) {
          files.push({
            path: rel,
            sha256: createHash('sha256').update(readFileSync(fd)).digest('hex'),
          });
        } else {
          throw stop('OUTPUT_SPECIAL_FILE', 'output special file refused');
        }
      } finally {
        closeSync(fd);
      }
    }
  };
  walk(rootDir);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

export function sealTree(files) {
  const hash = createHash('sha256');
  const seen = new Set();
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      file.path.startsWith('/') ||
      file.path.split('/').includes('..') ||
      !SEAL.test(file.sha256) ||
      seen.has(file.path)
    ) {
      throw stop('OUTPUT_SEAL_INVALID', 'output seal is missing');
    }
    seen.add(file.path);
    hash.update(file.path);
    hash.update(file.sha256);
  }
  if (seen.size === 0)
    throw stop('OUTPUT_SEAL_INVALID', 'output seal is missing');
  return hash.digest('hex');
}
