import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { fail, parseJson } from './operational-schema';

export const MAX_BYTES = 32 * 1024 * 1024;
export function safePath(input: string): string {
  const path = resolve(input);
  let current = path;
  for (;;) {
    try {
      if (lstatSync(current).isSymbolicLink())
        fail('UNSAFE_PATH', 'symlink paths are not allowed');
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
    }
    if (current === parse(current).root) break;
    current = dirname(current);
  }
  return path;
}
export function privateParent(path: string) {
  safePath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const parent = lstatSync(dirname(path));
  if (!parent.isDirectory() || (parent.mode & 0o077) !== 0)
    fail('UNSAFE_PATH', 'store parent must be a private 0700 directory');
}
export function exclusiveFile(input: string, contents?: string) {
  const path = safePath(input);
  privateParent(path);
  const fd = openSync(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    if (contents !== undefined) writeFileSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return path;
}
export function readJsonFile(input: string): unknown {
  const path = safePath(input);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES)
      fail(
        'INVALID_INPUT',
        'JSON input must be a regular file no larger than 32 MiB'
      );
    const bytes = readFileSync(fd);
    if (bytes.length > MAX_BYTES)
      fail('INVALID_INPUT', 'JSON input exceeds 32 MiB');
    return parseJson(bytes.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}
