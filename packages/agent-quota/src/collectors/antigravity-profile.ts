import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';

const providerDir = '.t3/userdata/providers/antigravity';

export function antigravityProfile(root: string, id: string): string {
  const hash = createHash('sha256').update(id).digest('hex');
  return join(root, providerDir, hash);
}

export function oldAntigravityProfile(
  root: string,
  instanceId: string,
  map: unknown
): string | undefined {
  if (
    !map ||
    typeof map !== 'object' ||
    !('entries' in map) ||
    !Array.isArray(map.entries)
  )
    return;

  const current = antigravityProfile(root, instanceId);
  const configuredHost = process.env.AGENT_QUOTA_RENAME_HOST?.toLowerCase();
  const localHost = hostname().split('.')[0]?.toLowerCase();
  let oldKey: string | undefined;
  const expand = (path: string) =>
    path.startsWith('~/') ? join(root, path.slice(2)) : path;
  for (const entry of map.entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      entry.new_key !== instanceId ||
      typeof entry.host !== 'string'
    )
      continue;
    const host = entry.host.toLowerCase();
    if (
      !host ||
      (configuredHost
        ? host !== configuredHost
        : host !== localHost && !localHost?.endsWith(`-${host}`))
    )
      continue;
    if (
      typeof entry.old_key !== 'string' ||
      !/^antigravity(?:_[a-zA-Z0-9_-]+)?$/.test(entry.old_key) ||
      (oldKey !== undefined && oldKey !== entry.old_key)
    )
      return;
    oldKey = entry.old_key;
    const old = antigravityProfile(root, oldKey);
    if (
      old === current ||
      typeof entry.old_data_dir !== 'string' ||
      typeof entry.new_data_dir !== 'string' ||
      expand(entry.old_data_dir) !== old ||
      expand(entry.new_data_dir) !== current
    )
      return;
  }
  return oldKey && antigravityProfile(root, oldKey);
}

export async function antigravityLogDirectory(
  root: string,
  profile: string
): Promise<string | undefined> {
  try {
    const providerRoot = await realpath(join(root, providerDir));
    const dir = join(profile, 'antigravity-acp/log');
    const expected = join(
      providerRoot,
      basename(profile),
      'antigravity-acp/log'
    );
    if ((await realpath(dir)) !== expected)
      throw new Error('unexpected-antigravity-log-path');
    return dir;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return;
    throw error;
  }
}
