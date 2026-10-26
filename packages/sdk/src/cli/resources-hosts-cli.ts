import { basename } from 'node:path';
import { limitCommand } from './resources-command';
import {
  defaultResourceConfig,
  laneResourceConfig,
  readResourceConfig,
  resourceEnvironment,
  resourceLanes,
} from './resources-config';
import {
  hostBudget,
  type JobClass,
  proposedHostRegistry,
  readHostRegistry,
} from './resources-hosts-config';
import type { HostDispatchDeps } from './resources-hosts-dispatch';
import { hostLedger } from './resources-hosts-ledger';
import { probeAutomaticHosts } from './resources-hosts-probe';
import {
  compareWithCurrent,
  preferenceScenarios,
  renderSimulation,
} from './resources-hosts-sim';
import { UntrustedRegistryError } from './resources-hosts-trust';
import { queuedResourceCommand, spawnResourceCommand } from './resources-queue';

// Explicit runs queue by default (trivial commands never reach --hosts), so
// an unrecognised command is heavy unless `--class light` says otherwise.
export function hostsJobClass(value: string | undefined): JobClass {
  if (value === undefined || value === 'heavy') return 'heavy';
  if (value === 'light') return 'light';
  throw new Error('--class must be light or heavy.');
}

// Production wiring for `ttr resources run --hosts`: local work goes through
// the lane FIFO (heavy) or a light reservation; remote work reuses #6454's
// devbox offload transport unchanged.
export function hostsDependencies({
  home,
  name,
  real,
  command,
  env,
  timeoutSeconds,
  ignorePressure,
}: {
  home: string;
  name: string;
  real: string;
  command: string[];
  env: NodeJS.ProcessEnv;
  timeoutSeconds?: number;
  ignorePressure: boolean;
}): HostDispatchDeps {
  const box = () => import('./resources-box-offload.js');
  let client: Awaited<
    ReturnType<Awaited<ReturnType<typeof box>>['createSessionClient']>
  >;
  const session = async () => {
    const module = await box();
    client ??= await module.createSessionClient();
    return { module, client };
  };
  return {
    probeHosts: probeAutomaticHosts,
    fleet: async () => {
      const { module, client } = await session();
      return module.offloadRequest((signal) =>
        client.devboxes.fleet.snapshot({ signal })
      );
    },
    commitPlan: async (cwd) => {
      try {
        return (await box()).offloadCommitPlan(cwd);
      } catch {
        // Dirty or unpushed trees stay local-only.
        return undefined;
      }
    },
    runLocal: async ({ host, jobClass, reservation, marker, onChild }) => {
      const config =
        (await readResourceConfig(home)) || defaultResourceConfig();
      const caps = {
        ...laneResourceConfig(config),
        vitestWorkers: host.workers[jobClass],
        buildJobs: host.workers[jobClass],
      };
      const childEnv = { ...env, ...resourceEnvironment(caps), ...marker };
      if (jobClass === 'heavy')
        return queuedResourceCommand(
          home,
          real,
          limitCommand(basename(name), command, caps),
          childEnv,
          ignorePressure,
          resourceLanes(config)
        );
      return spawnResourceCommand(
        real,
        limitCommand(basename(name), command, caps),
        { ...childEnv, TTR_RESOURCES_HOST: reservation.hostId },
        true,
        onChild
      );
    },
    runRemote: async ({ host, sha, prefix, operationId }) => {
      const { module, client } = await session();
      try {
        return await module.runBoxOffload({
          client,
          runnerId: host.runnerId!,
          sha,
          prefix,
          operationId,
          argv: [name, ...command],
          timeoutSeconds: timeoutSeconds || module.defaultOffloadTimeoutSeconds,
        });
      } catch (error) {
        if (error instanceof module.OffloadNotCreatedError && error.rejected)
          return { rejected: true, reason: error.message };
        process.stderr.write(
          `[ttr resources] ${error instanceof Error ? error.message : String(error)}. The run may exist remotely, so it is not repeated; check \`ttr box list\`.\n`
        );
        return 1;
      }
    },
  };
}

// `ttr resources hosts [--json] [--simulate]`: registry, budgets, live
// reservations, and an offline dry-run of the measured queue.
export async function runHostsAction(home: string, options: string[]) {
  const json = options.includes('--json');
  if (options.includes('--simulate')) {
    const { current, proposed } = compareWithCurrent();
    const preference = preferenceScenarios();
    process.stdout.write(
      json
        ? `${JSON.stringify({ current, proposed, preference }, null, 2)}\n`
        : [
            renderSimulation('current (M4 only, 2 lanes)', current),
            renderSimulation(
              'proposed (M4 + skr-linux-lan, weighted)',
              proposed
            ),
            `preference order: ${preference.order.join(' > ')} (skr-studio and skr-sonha capacity illustrative)\n`,
            renderSimulation(
              'preference, today (skr-studio offline, skr-sonha degraded: skipped)',
              preference.today
            ),
            renderSimulation(
              'preference, every host healthy',
              preference.allHealthy
            ),
          ].join('')
    );
    return;
  }
  let registry: Awaited<ReturnType<typeof readHostRegistry>>;
  let ignored: string | undefined;
  try {
    registry = await readHostRegistry(home);
  } catch (error) {
    if (!(error instanceof UntrustedRegistryError)) throw error;
    ignored = error.message;
  }
  const ledger = registry
    ? await hostLedger(home)
    : { reservations: [], tickets: [] };
  const result = {
    configured: Boolean(registry),
    hosts: (registry ?? proposedHostRegistry()).hosts.map((host) => ({
      ...host,
      budget: hostBudget(host),
      reservations: ledger.reservations.filter(
        (entry) => entry.hostId === host.id
      ),
    })),
    waiting: ledger.tickets,
    ...(registry
      ? {}
      : {
          note:
            ignored ??
            'hosts.json is not configured: showing the proposed registry. Multi-host admission stays off until an operator installs it.',
        }),
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const lines = [
    result.configured
      ? 'Multi-host admission: configured'
      : `Multi-host admission: off. ${result.note}`,
  ];
  for (const host of result.hosts)
    lines.push(
      `${host.id} (${host.kind}${host.runnerId ? ` ${host.runnerId}` : ''}${host.preference ? `, preference ${host.preference}` : ''}): heavy ${host.reservations.filter((entry) => entry.jobClass === 'heavy').length}/${host.slots.heavy}, light ${host.reservations.filter((entry) => entry.jobClass === 'light').length}/${host.slots.light}; budget ${host.budget.cpus} CPU, ${host.budget.memoryGiB} GiB after reserving ${host.reserved.cpus} CPU, ${host.reserved.memoryGiB} GiB, ${host.reserved.diskGiB} GiB disk`
    );
  lines.push(`waiting: ${result.waiting.length}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}
