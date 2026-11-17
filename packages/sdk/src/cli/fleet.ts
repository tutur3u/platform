import { execFile } from 'node:child_process';
import { loadavg, availableParallelism } from 'node:os';
import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { resourceHome } from './resources-config';
import { readHostRegistry, type HostRegistry } from './resources-hosts-config';
import { probeAutomaticHosts } from './resources-hosts-probe';

type FleetRow = { id: string; executionEligibility: 'UNKNOWN' } & (
  | { telemetry: 'UNKNOWN' }
  | {
      telemetry: 'CURRENT';
      brokerJobs: {
        running: number;
        waiting: number;
        loadPerCpu: number;
        diskFreeGiB: number;
      };
    }
);

const count = z.number().int().nonnegative();
const localSchema = z.object({
  occupied: count,
  waiting: z.array(z.unknown()),
  machine: z.object({ platform: z.enum(['linux', 'darwin']) }),
  disk: z.object({ freeGiB: z.number().finite().nonnegative() }),
});
const localStatus = () =>
  new Promise<unknown>((resolve, reject) => {
    execFile(
      process.execPath,
      [process.argv[1]!, 'resources', 'status', '--json'],
      { timeout: 12_000, maxBuffer: 256 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('invalid telemetry'));
        }
      }
    );
  });

// Exclusion checks cover registry identity and transport aliases before any I/O.
export const excludedFleetHost = (host: HostRegistry['hosts'][number]) =>
  [host.id, host.runnerId, host.sshHost].some(
    (value) => value !== undefined && /(^|[.-])m3([.-]|$)/iu.test(value)
  );

export async function fleetSnapshot(
  registry: HostRegistry,
  dependencies = {
    probe: probeAutomaticHosts,
    local: localStatus,
    now: Date.now,
  }
) {
  const started = dependencies.now();
  const hosts = registry.hosts.filter((host) => !excludedFleetHost(host));
  const rows = await Effect.runPromise(
    Effect.forEach(
      hosts,
      (host) =>
        Effect.tryPromise(async () => {
          if (host.kind === 'local') {
            const sample = localSchema.parse(await dependencies.local());
            return {
              running: sample.occupied,
              waiting: sample.waiting.length,
              loadPerCpu: loadavg()[0]! / availableParallelism(),
              diskFreeGiB: sample.disk.freeGiB,
            };
          }
          const result = (
            await dependencies.probe({ ...registry, hosts: [host] })
          )[host.id];
          if (!result?.healthy) throw new Error('unknown');
          return {
            running: result.sample.occupied,
            waiting: result.sample.waiting,
            loadPerCpu: result.sample.loadPerCpu,
            diskFreeGiB: result.sample.diskFreeGiB,
          };
        }).pipe(
          Effect.match({
            onFailure: (): FleetRow => ({
              id: host.id,
              telemetry: 'UNKNOWN',
              executionEligibility: 'UNKNOWN',
            }),
            onSuccess: (sample): FleetRow =>
              dependencies.now() - started > registry.telemetryTtlSeconds * 1000
                ? {
                    id: host.id,
                    telemetry: 'UNKNOWN',
                    executionEligibility: 'UNKNOWN',
                  }
                : {
                    id: host.id,
                    telemetry: 'CURRENT',
                    executionEligibility: 'UNKNOWN',
                    brokerJobs: sample,
                  },
          })
        ),
      { concurrency: 4 }
    )
  );
  const finished = dependencies.now();
  const finalRows =
    finished - started > registry.telemetryTtlSeconds * 1000
      ? rows.map((row): FleetRow => ({
          id: row.id,
          telemetry: 'UNKNOWN',
          executionEligibility: 'UNKNOWN',
        }))
      : rows;
  return {
    schemaVersion: 1,
    startedAt: new Date(started).toISOString(),
    collectedAt: new Date(finished).toISOString(),
    threads: 'UNKNOWN',
    hosts: finalRows,
  };
}

export async function runFleetCommand(args: string[]) {
  if (args.length === 0 || args[0] === '--help') {
    process.stdout.write(
      'Usage: ttr fleet <ls|health> [--json]\nRead-only broker inventory; thread inventory and execution eligibility are UNKNOWN.\n'
    );
    return;
  }
  if (
    !['ls', 'health'].includes(args[0]!) ||
    args.slice(1).some((arg) => arg !== '--json') ||
    args.length > 2
  )
    throw new Error('Usage: ttr fleet <ls|health> [--json]');
  try {
    const registry = await readHostRegistry(resourceHome());
    if (!registry) throw new Error('missing');
    const result = await fleetSnapshot(registry);
    process.stdout.write(
      args.includes('--json')
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${result.hosts.map((host) => `${host.id}: ${host.telemetry}; execution UNKNOWN${host.telemetry === 'CURRENT' ? `; broker jobs ${host.brokerJobs.running} running, ${host.brokerJobs.waiting} waiting; load/CPU ${host.brokerJobs.loadPerCpu}; disk GiB ${host.brokerJobs.diskFreeGiB}` : ''}`).join('\n')}\n`
    );
  } catch {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, collectedAt: new Date().toISOString(), telemetry: 'UNKNOWN', hosts: [] })}\n`
    );
    process.exitCode = 1;
  }
}
