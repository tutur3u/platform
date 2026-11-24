import { randomUUID } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * Run files that hold QA passwords or shared state live in a private
 * directory: created 0700, and refused when it is a symlink, owned by
 * another user, or writable by group or others.
 */
export function ensurePrivateDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Run directory must be a real directory');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid())
    throw new Error('Run directory is owned by another user');
  if ((stat.mode & 0o022) !== 0)
    throw new Error('Run directory is writable by other users');
}

/**
 * Writes `data` atomically: an exclusively created 0600 temp file in the
 * private directory, fully written through its descriptor, then renamed
 * over `path`. Readers never see a partial file and no existing path or
 * symlink is written through.
 */
export function writePrivateFile(path: string, data: string) {
  ensurePrivateDir(dirname(path));
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
