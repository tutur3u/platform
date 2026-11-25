// Source map selection for cf Build Output uploads. Cloudflare rejects a
// version whose source maps exceed 60 MiB encoded or 15 MiB gzipped (API
// error 10021). When every map fits, all of them ship. Otherwise maps are
// kept in a fixed order (the main module's map first, then the smallest
// first) while the kept total stays within 90% of both limits; the rest are
// dropped and named in the receipt. Only `.map` files are ever dropped: the
// JS modules, the module manifest's ESM entries and every module-set or
// closure check are unaffected. The choice is made when the Build Output is
// emitted, so any later measurement and the upload see the same maps.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { uploadLimits } from './wave1-native-upload-limits.mjs';

export const SOURCEMAP_SAFETY_RATIO = 0.9;

export function sourceMapBudget(limits = uploadLimits) {
  return {
    encodedLimitBytes: limits.sourcemapEncodedBytes,
    gzipLimitBytes: limits.sourcemapGzipBytes,
    encodedBudgetBytes: Math.floor(
      limits.sourcemapEncodedBytes * SOURCEMAP_SAFETY_RATIO
    ),
    gzipBudgetBytes: Math.floor(
      limits.sourcemapGzipBytes * SOURCEMAP_SAFETY_RATIO
    ),
  };
}

/** Encoded and gzipped bytes of one map file. */
export function measureSourceMap(path) {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
}

const sum = (items, field) =>
  items.reduce((total, item) => total + item[field], 0);

/**
 * Chooses which maps to upload. `maps` are { name, bytes, gzipBytes } for the
 * maps of ESM modules; `mainMap` names the main module's map. Per-map gzip
 * sizes are summed, which never understates the gzip of the maps together.
 */
export function selectSourceMaps(maps, mainMap, budget = sourceMapBudget()) {
  const total = {
    bytes: sum(maps, 'bytes'),
    gzipBytes: sum(maps, 'gzipBytes'),
  };
  const report = (kept, dropped) => ({
    ...budget,
    totalCount: maps.length,
    totalBytes: total.bytes,
    keptCount: kept.length,
    keptBytes: sum(kept, 'bytes'),
    keptGzipBytes: sum(kept, 'gzipBytes'),
    droppedCount: dropped.length,
    droppedBytes: sum(dropped, 'bytes'),
    dropped: dropped
      .map(({ name, bytes }) => ({ name, bytes }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    kept: kept.map(({ name }) => name).sort(),
  });
  if (
    total.bytes <= budget.encodedLimitBytes &&
    total.gzipBytes <= budget.gzipLimitBytes
  )
    return report(maps, []);
  const main = maps.filter(({ name }) => name === mainMap);
  const rest = maps
    .filter(({ name }) => name !== mainMap)
    .sort((a, b) => a.bytes - b.bytes || a.name.localeCompare(b.name));
  const kept = [];
  const dropped = [];
  let bytes = 0;
  let gzipBytes = 0;
  for (const map of [...main, ...rest]) {
    if (
      bytes + map.bytes <= budget.encodedBudgetBytes &&
      gzipBytes + map.gzipBytes <= budget.gzipBudgetBytes
    ) {
      kept.push(map);
      bytes += map.bytes;
      gzipBytes += map.gzipBytes;
    } else dropped.push(map);
  }
  return report(kept, dropped);
}
