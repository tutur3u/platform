import { constants, type Dirent } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function openRegularFile(path: string) {
  const noFollow = constants.O_NOFOLLOW || 0;
  const flags = constants.O_RDONLY | noFollow | (constants.O_NONBLOCK || 0);
  if (noFollow) return open(path, flags);
  // Without O_NOFOLLOW, open first and only then confirm that the path still
  // names that same regular file. A symlink or a swapped inode at the path no
  // longer matches the opened descriptor, so it is rejected; checking before
  // opening would leave a check-then-use window.
  const file = await open(path, flags);
  try {
    const opened = await file.stat({ bigint: true });
    const named = await lstat(path, { bigint: true });
    if (
      !opened.isFile() ||
      !named.isFile() ||
      opened.ino === 0n ||
      named.dev !== opened.dev ||
      named.ino !== opened.ino
    ) {
      throw new Error('not-a-regular-file');
    }
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

export async function readJsonlSnapshot(path: string, minimumMtimeMs: number) {
  const file = await openRegularFile(path);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.mtimeMs < minimumMtimeMs) return;
    return {
      mtime: info.mtime,
      mtimeMs: info.mtimeMs,
      content: await file.readFile('utf8'),
    };
  } finally {
    await file.close();
  }
}

export async function listJsonlFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.jsonl'))
        found.push(path);
    }
  };
  await visit(root);
  return found;
}
