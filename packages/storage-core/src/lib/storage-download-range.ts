import { StorageDownloadError } from './storage-download-token';

/** Resolve one range against the inspected object before reserving bytes. */
export function resolveStorageDownloadRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0)
    throw new StorageDownloadError('Range not satisfiable', 416);
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if (
    (first !== undefined && (!Number.isSafeInteger(first) || first >= size)) ||
    (first === undefined && last === 0) ||
    (first !== undefined && last !== undefined && last < first)
  )
    throw new StorageDownloadError('Range not satisfiable', 416);
  const start = first ?? Math.max(0, size - last!);
  const end =
    first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  return {
    header: `bytes=${start}-${end}`,
    contentRange: `bytes ${start}-${end}/${size}`,
    bytes: end - start + 1,
  };
}
