import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { join } from 'node:path';

const roles = new Map([
  ['tuturuuu-meet', 'app'],
  ['meet-ci-binding-probe', 'probe'],
]);
const fields = [
  'debugPortAddress',
  'defaultEntrypointService',
  'instanceId',
  'userWorkerService',
];

// Diagnostics never authorize a role or retain SDK record contents/identifiers.
export async function projectMeetRegistry(prepared, startedAt) {
  try {
    const entries = [],
      identities = [];
    let truncated = false;
    for await (const entry of await opendir(prepared.registry)) {
      if (entries.length === 4) {
        truncated = true;
        break;
      }
      const role = roles.get(entry.name) ?? 'foreign';
      const path = join(prepared.registry, entry.name);
      const info = await lstat(path);
      const fact = { role, regular: info.isFile() && !info.isSymbolicLink() };
      entries.push(fact);
      if (!fact.regular || role === 'foreign') continue;
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
      try {
        const stat = await file.stat();
        fact.bounded = stat.isFile() && stat.size <= 4096;
        fact.fresh = stat.mtimeMs >= startedAt;
        if (!fact.bounded) continue;
        const bytes = Buffer.alloc(4097);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 4096) {
          fact.bounded = false;
          continue;
        }
        let value;
        try {
          value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
        } catch {
          fact.parsed = false;
          continue;
        }
        fact.parsed =
          !!value && typeof value === 'object' && !Array.isArray(value);
        if (!fact.parsed) continue;
        fact.closed =
          JSON.stringify(Object.keys(value).sort()) === JSON.stringify(fields);
        const address = value.debugPortAddress;
        fact.loopback =
          typeof address === 'string' &&
          /^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(address) &&
          Number(address.split(':')[1]) <= 65535;
        fact.userMapping =
          value.userWorkerService === `core:user:${entry.name}`;
        fact.entryMapping =
          value.defaultEntrypointService ===
          (role === 'app'
            ? `assets:rpc-proxy:${entry.name}`
            : `core:user:${entry.name}`);
        fact.instancePresent =
          typeof value.instanceId === 'string' &&
          value.instanceId.length > 0 &&
          value.instanceId.length < 128;
        if (fact.instancePresent) identities.push(value.instanceId);
      } finally {
        await file.close();
      }
    }
    entries.sort((a, b) => a.role.localeCompare(b.role));
    return {
      schema: 1,
      entries,
      truncated,
      reusedInstance: new Set(identities).size !== identities.length,
    };
  } catch {
    throw new Error('Meet registry projection unavailable');
  }
}
