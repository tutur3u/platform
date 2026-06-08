import {
  createDevboxCacheKey,
  type DevboxCacheRecord,
  planCacheEvictions,
} from './cache';
import { evaluateDevboxCommandPolicy } from './command-policy';
import { type DevboxEnv, mergeDevboxEnv, redactDevboxSecrets } from './env';

export interface DevboxHarnessRunInput {
  command: string[];
  env?: DevboxEnv;
  files?: Record<string, string>;
  keep?: boolean;
  leaseId?: string;
  logs?: string[];
}

export interface DevboxHarnessLease {
  env: DevboxEnv;
  id: string;
  remoteFiles: Record<string, string>;
  status: 'active' | 'released';
}

function createId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

export function createDevboxHarness() {
  let leaseIndex = 0;
  let runIndex = 0;
  let caches: DevboxCacheRecord[] = [];
  const leases = new Map<string, DevboxHarnessLease>();

  const ensureLease = (input: DevboxHarnessRunInput) => {
    if (input.leaseId) {
      const existing = leases.get(input.leaseId);
      if (!existing) throw new Error(`Unknown lease: ${input.leaseId}`);
      return existing;
    }

    leaseIndex += 1;
    const lease: DevboxHarnessLease = {
      env: {},
      id: createId('lease', leaseIndex),
      remoteFiles: {},
      status: 'active',
    };
    leases.set(lease.id, lease);
    return lease;
  };

  const runSync = (input: DevboxHarnessRunInput) => {
    const policy = evaluateDevboxCommandPolicy(input.command);
    if (!policy.allowed) {
      throw new Error(`blocked: ${policy.reason}`);
    }

    runIndex += 1;
    const lease = ensureLease(input);
    lease.env = mergeDevboxEnv(lease.env, { updates: input.env });
    lease.remoteFiles = {
      ...lease.remoteFiles,
      ...(input.files ?? {}),
    };

    const rawLogs = [
      `remote$ ${input.command.join(' ')}`,
      ...(input.logs ?? []),
    ];
    const logs = rawLogs.map((line) => redactDevboxSecrets(line, lease.env));

    if (!input.keep && !input.leaseId) {
      lease.status = 'released';
    }

    return {
      exitCode: 0,
      leaseId: lease.id,
      logs,
      remoteFiles: { ...lease.remoteFiles },
      runId: createId('run', runIndex),
    };
  };

  return {
    getLease: (leaseId: string) => leases.get(leaseId),
    pruneCaches: () =>
      planCacheEvictions(caches, {
        activeInput: {
          bunVersion: '1.3.14',
          cacheSchemaVersion: 1,
          commandProfile: 'bun-check',
          lockfileHash: 'lock-a',
          nodeVersion: '22.18.0',
          platform: 'linux/arm64',
          repoFingerprint: 'repo-a',
          runtimeImageDigest: createDevboxCacheKey({
            cacheSchemaVersion: 1,
            commandProfile: 'runtime',
            lockfileHash: 'lock-a',
            platform: 'linux/arm64',
            repoFingerprint: 'repo-a',
            runtimeImageDigest: 'sha256:runtime',
          }),
        },
        maxBytes: 1,
      }),
    run: async (input: DevboxHarnessRunInput) => runSync(input),
    runSync,
    seedCaches: (records: DevboxCacheRecord[]) => {
      caches = records;
    },
    updateEnv: (leaseId: string, updates: DevboxEnv) => {
      const lease = leases.get(leaseId);
      if (!lease) throw new Error(`Unknown lease: ${leaseId}`);
      lease.env = mergeDevboxEnv(lease.env, { updates });
    },
  };
}
