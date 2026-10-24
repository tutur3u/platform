import { constants, type Dirent } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function readJsonlSnapshot(path: string, minimumMtimeMs: number) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
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
