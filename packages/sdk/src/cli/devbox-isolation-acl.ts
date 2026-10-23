import { dirname } from 'node:path';
import type { DevboxIsolationProbes } from './devbox-isolation';

// Conservatively require no effective extended grant, even to an unrelated
// identity. A clean mode-bit check alone cannot prove isolation through ACLs.
async function extendedGrants(path: string, probes: DevboxIsolationProbes) {
  if (probes.platform === 'linux') {
    const result = await probes.run('getfacl', [
      '--omit-header',
      '--absolute-names',
      '--numeric',
      '--',
      path,
    ]);
    if (result.code !== 0) return undefined;
    const entries = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = entries.map((line) =>
      /^(default:)?(user|group|mask|other):([^:]*):([r-][w-][x-])(?:\s+#effective:[r-][w-][x-])?$/u.exec(
        line
      )
    );
    const keys = new Set<string>();
    for (const entry of parsed) {
      if (!entry) return undefined;
      const key = `${entry[1] ?? ''}${entry[2]}:${entry[3]}`;
      if (keys.has(key)) return undefined;
      keys.add(key);
      if (
        entry[3] &&
        (!['user', 'group'].includes(entry[2] ?? '') ||
          !/^\d+$/u.test(entry[3]))
      )
        return undefined;
    }
    for (const prefix of ['', 'default:']) {
      if (prefix && !parsed.some((entry) => entry?.[1])) continue;
      for (const type of ['user', 'group', 'other'])
        if (!keys.has(`${prefix}${type}:`)) return undefined;
    }
    const grants: string[] = [];
    for (const entry of parsed) {
      if (!entry?.[3]) continue;
      const mask = parsed.find(
        (candidate) =>
          candidate && candidate[1] === entry[1] && candidate[2] === 'mask'
      );
      if (!mask) return undefined;
      if (
        [0, 1, 2].some(
          (bit) => entry[4]?.[bit] !== '-' && mask[4]?.[bit] !== '-'
        )
      )
        grants.push(entry[0]);
    }
    return grants;
  }
  if (probes.platform === 'darwin') {
    const result = await probes.run('ls', ['-led', '--', path]);
    if (result.code !== 0) return undefined;
    const [header, ...entries] = result.stdout.trimEnd().split('\n');
    if (!header || !/^[bcdlps-][rwxStTs-]{9}[+@ ]/u.test(header))
      return undefined;
    const grants: string[] = [];
    for (const line of entries) {
      if (!/^\s*\d+:\s+\S+\s+(?:inherited\s+)?(?:allow|deny)\s+\S/u.test(line))
        return undefined;
      if (/\sallow\s/u.test(line)) grants.push(line.trim());
    }
    // An ACL marker with no readable entries is not evidence of an empty ACL.
    if (header[10] === '+' && entries.length === 0) return undefined;
    return grants;
  }
  return undefined;
}

export function createAclInspector(probes: DevboxIsolationProbes) {
  const cache = new Map<string, Promise<string[] | undefined>>();
  return async (path: string) => {
    const real = await probes.realpath(path).catch(() => undefined);
    if (!real) return undefined;
    const paths = new Set<string>();
    for (const start of [path, real])
      for (let current = start; ; current = dirname(current)) {
        paths.add(current);
        if (dirname(current) === current) break;
      }
    const grants: string[] = [];
    let unknown = false;
    for (const current of paths) {
      let pending = cache.get(current);
      if (!pending) {
        pending = extendedGrants(current, probes).catch(() => undefined);
        cache.set(current, pending);
      }
      const entries = await pending;
      if (entries === undefined) unknown = true;
      else grants.push(...entries.map((entry) => `${current}: ${entry}`));
    }
    return grants.length ? grants : unknown ? undefined : [];
  };
}
