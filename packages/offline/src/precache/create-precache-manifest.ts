import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { PrecacheEntry } from '../worker/types';

const DEFAULT_MAXIMUM_FILE_SIZE = 2 * 1024 * 1024;

export interface PrecacheManifestOptions {
  additionalEntries?: PrecacheEntry[];
  assetPrefix?: string;
  basePath?: string;
  cwd?: string;
  distDir?: string;
  globDirectory?: string;
  globIgnores?: string[];
  globPatterns: string[];
  maximumFileSizeToCacheInBytes?: number;
}

function joinUrl(prefix: string, value: string) {
  const normalizedPrefix = prefix === '/' ? '' : prefix.replace(/\/$/, '');
  return `${normalizedPrefix}/${value.replace(/^\//, '')}`;
}

function toPublicUrl(
  file: string,
  options: Pick<PrecacheManifestOptions, 'assetPrefix' | 'basePath' | 'distDir'>
) {
  const normalizedFile = file.split(path.sep).join('/');
  const distDir = (options.distDir ?? '.next').replace(/^\/|\/$/g, '');

  if (normalizedFile.startsWith(`${distDir}/static/`)) {
    const staticPath = normalizedFile.slice(`${distDir}/`.length);
    return joinUrl(options.assetPrefix ?? '', `_next/${staticPath}`);
  }

  if (normalizedFile.startsWith('public/')) {
    return joinUrl(options.basePath ?? '/', normalizedFile.slice(7));
  }

  return joinUrl(options.basePath ?? '/', normalizedFile);
}

export async function createPrecacheManifest(
  options: PrecacheManifestOptions
): Promise<PrecacheEntry[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const globDirectory = path.resolve(cwd, options.globDirectory ?? '.');
  const files = await glob(options.globPatterns, {
    cwd: globDirectory,
    dot: false,
    follow: true,
    ignore: options.globIgnores,
    nodir: true,
    posix: true,
  });
  const entries = new Map<string, PrecacheEntry>();
  const maximumFileSize =
    options.maximumFileSizeToCacheInBytes ?? DEFAULT_MAXIMUM_FILE_SIZE;

  for (const file of files.sort()) {
    const absolutePath = path.resolve(globDirectory, file);
    const metadata = await stat(absolutePath);

    if (metadata.size > maximumFileSize) {
      continue;
    }

    const contents = await readFile(absolutePath);
    entries.set(toPublicUrl(file, options), {
      revision: createHash('sha256').update(contents).digest('hex'),
      url: toPublicUrl(file, options),
    });
  }

  for (const entry of options.additionalEntries ?? []) {
    entries.set(entry.url, entry);
  }

  return [...entries.values()].sort((first, second) =>
    first.url.localeCompare(second.url)
  );
}
