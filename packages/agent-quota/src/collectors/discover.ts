import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider } from '../types';
import type { CatalogInstance } from './catalog';
import { defaultCollectorPaths } from './paths';
import { driverToProvider } from './provider';

const ORPHAN_STALE_GAP_MS = 14 * 86_400_000;

export async function readRegularJsonFile(path: string): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2_000_000)
      throw new Error('snapshot-invalid-or-full');
    return JSON.parse(await file.readFile('utf8')) as unknown;
  } finally {
    await file.close();
  }
}

export function extractModelsFromCache(value: Record<string, unknown>): {
  models: string[];
  modelOptions: Record<string, { id: string; values: (string | boolean)[] }[]>;
} {
  if (!Array.isArray(value.models)) return { models: [], modelOptions: {} };
  const models: string[] = [];
  const modelOptions: Record<
    string,
    { id: string; values: (string | boolean)[] }[]
  > = {};
  for (const item of value.models) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const id =
      typeof entry.slug === 'string'
        ? entry.slug
        : typeof entry.id === 'string'
          ? entry.id
          : undefined;
    if (!id) continue;
    models.push(id);
    const caps = entry.capabilities as Record<string, unknown> | undefined;
    const descriptors = Array.isArray(caps?.optionDescriptors)
      ? caps.optionDescriptors
      : [];
    const options = descriptors.flatMap((desc) => {
      if (!desc || typeof desc !== 'object') return [];
      const d = desc as Record<string, unknown>;
      if (typeof d.id !== 'string' || !Array.isArray(d.options)) return [];
      const values = d.options.flatMap((opt) =>
        opt &&
        typeof opt === 'object' &&
        (typeof (opt as Record<string, unknown>).id === 'string' ||
          typeof (opt as Record<string, unknown>).id === 'boolean')
          ? [(opt as Record<string, unknown>).id as string | boolean]
          : []
      );
      return values.length ? [{ id: d.id, values }] : [];
    });
    if (options.length) modelOptions[id] = options;
  }
  return { models, modelOptions };
}

export async function discoverSnapshotInstances(
  cacheDir = defaultCollectorPaths().snapshotCacheDir
): Promise<CatalogInstance[]> {
  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return [];
  }
  const records: Array<{
    instanceId: string;
    provider: Provider;
    label: string;
    models: string[];
    modelOptions: Record<
      string,
      { id: string; values: (string | boolean)[] }[]
    >;
    available: boolean;
    checkedAtMs: number;
    hasLimits: boolean;
    status: string;
  }> = [];

  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue;
    const stem = name.slice(0, -5);
    if (!/^[a-zA-Z0-9_-]+$/.test(stem)) continue;
    try {
      const raw = await readRegularJsonFile(join(cacheDir, name));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const value = raw as Record<string, unknown>;
      const provider = driverToProvider(value.driver);
      if (!provider || value.instanceId !== stem) continue;
      if (value.enabled === false || value.status === 'disabled') continue;
      const extracted = extractModelsFromCache(value);
      const checkedAtMs =
        typeof value.checkedAt === 'string' &&
        Number.isFinite(Date.parse(value.checkedAt))
          ? Date.parse(value.checkedAt)
          : 0;
      const limits = value.usageLimits as Record<string, unknown> | undefined;
      records.push({
        instanceId: stem,
        provider,
        label: typeof value.displayName === 'string' ? value.displayName : stem,
        models: extracted.models,
        modelOptions: extracted.modelOptions,
        available: value.status === 'ready',
        checkedAtMs,
        hasLimits: Boolean(limits && Array.isArray(limits.windows)),
        status: typeof value.status === 'string' ? value.status : 'unknown',
      });
    } catch {
      /* Ignore unreadable or non-regular cache entries. */
    }
  }
  if (!records.length) return [];
  const newestMs = Math.max(...records.map((r) => r.checkedAtMs));
  return records
    .filter(
      (r) =>
        r.hasLimits ||
        r.status === 'ready' ||
        newestMs - r.checkedAtMs <= ORPHAN_STALE_GAP_MS
    )
    .map(
      ({ instanceId, provider, label, models, modelOptions, available }) => ({
        instanceId,
        provider,
        label,
        models,
        modelOptions,
        available,
      })
    );
}
