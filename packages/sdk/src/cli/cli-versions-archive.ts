import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix, win32 } from 'node:path';
import { gunzipSync } from 'node:zlib';

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const BLOCK = 512;

function unsafe(reason: string): never {
  throw new Error(`Unsafe CLI archive: ${reason}; nothing was extracted.`);
}

function field(header: Buffer, start: number, length: number) {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end).some((byte) => byte !== 0))
    unsafe('invalid header string');
  return bytes.subarray(0, end < 0 ? bytes.length : end).toString('utf8');
}

function octal(header: Buffer, start: number, length: number) {
  const value = header
    .subarray(start, start + length)
    .toString('ascii')
    .replaceAll('\0', '')
    .trim();
  if (!/^[0-7]+$/u.test(value)) unsafe('invalid header number');
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) unsafe('oversized member');
  return parsed;
}

function memberPath(name: string) {
  if (
    !name ||
    name.includes('\\') ||
    posix.isAbsolute(name) ||
    win32.isAbsolute(name) ||
    name.split('/').includes('..')
  )
    unsafe('absolute or traversing member path');
  const normalized = posix.normalize(name).replace(/\/$/u, '');
  if (normalized !== 'package' && !normalized.startsWith('package/'))
    unsafe('member escapes the package directory');
  if (normalized === 'package/.bun-tag') unsafe('reserved installer metadata');
  return normalized;
}

/** Only regular files and directories are supported. No tar process sees supplier bytes. */
export async function extractCliArchive(bytes: Buffer, destination: string) {
  let tar: Buffer;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch {
    unsafe('invalid or oversized gzip stream');
  }
  const entries: {
    path: string;
    directory: boolean;
    data: Buffer;
    mode: number;
  }[] = [];
  const paths = new Map<string, boolean>();
  let offset = 0;
  let terminated = false;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      if (
        tar.length - offset < BLOCK * 2 ||
        tar.subarray(offset).some((byte) => byte !== 0)
      )
        unsafe('invalid end of archive');
      terminated = true;
      break;
    }
    const checksum = octal(header, 148, 8);
    const actual = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0
    );
    if (checksum !== actual) unsafe('invalid header checksum');
    const magic = field(header, 257, 6);
    if (magic !== 'ustar' && magic !== 'ustar ' && magic !== '')
      unsafe('unsupported archive format');
    const prefix = magic === 'ustar' ? field(header, 345, 155) : '';
    const name = field(header, 0, 100);
    const path = memberPath(prefix ? `${prefix}/${name}` : name);
    const type = header[156];
    if (type !== 0 && type !== 48 && type !== 53)
      unsafe('unsupported link or special member');
    if (field(header, 157, 100)) unsafe('unexpected link target');
    const directory = type === 53;
    const size = octal(header, 124, 12);
    if ((directory && size !== 0) || (path === 'package' && !directory))
      unsafe('invalid directory member');
    if (paths.has(path)) unsafe('duplicate member path');
    paths.set(path, directory);
    offset += BLOCK;
    if (size > tar.length - offset) unsafe('truncated member');
    entries.push({
      path,
      directory,
      data: tar.subarray(offset, offset + size),
      mode: octal(header, 100, 8) & 0o777,
    });
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
  if (!terminated || entries.length === 0) unsafe('missing archive terminator');
  for (const entry of entries) {
    let parent = posix.dirname(entry.path);
    while (parent !== '.') {
      if (paths.get(parent) === false)
        unsafe('file used as a parent directory');
      parent = posix.dirname(parent);
    }
  }
  // All members and parent relationships have been checked before the first write.
  for (const entry of entries.filter((value) => value.directory))
    await mkdir(join(destination, entry.path), {
      recursive: true,
      mode: 0o700,
    });
  for (const entry of entries.filter((value) => !value.directory)) {
    const target = join(destination, entry.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, entry.data, {
      flag: 'wx',
      mode: entry.mode & 0o111 ? 0o700 : 0o600,
    });
  }
}
