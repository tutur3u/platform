import {
  idleFor,
  idleWarningMs,
  ownerCpu,
  processCpuTable,
  readActivity,
} from './resources-activity';
import type { ResourceOwner } from './resources-slots';

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m${String(total % 60).padStart(2, '0')}s`;
  return `${total}s`;
}

const since = (value: string | undefined, now: number) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? Math.max(0, (now - time) / 1000) : 0;
};

// Read-only diagnostics: idle owners are reported, never signalled.
export async function resourceStatusDetails(
  state: {
    owners: ResourceOwner[];
    ownerSlots: string[];
    waiting: ResourceOwner[];
  },
  now = Date.now(),
  // One ps sample for every owner; callers may pass the sample they already
  // took so that a whole report is evaluated on a single snapshot.
  sample?: Awaited<ReturnType<typeof processCpuTable>>
) {
  const table = sample ?? (await processCpuTable());
  const ownerDetails = await Promise.all(
    state.owners.map(async (owner, index) => {
      const slot = state.ownerSlots[index];
      const activity = slot ? await readActivity(slot, owner.token) : undefined;
      const cpu =
        table && owner.childPid !== undefined
          ? ownerCpu(owner, table)
          : undefined;
      return {
        pid: owner.pid,
        childPid: owner.childPid ?? null,
        tool: owner.tool,
        command: owner.command ?? owner.tool,
        cwd: owner.cwd,
        startedAt: owner.startedAt ?? null,
        elapsedSeconds: Math.round(
          since(owner.startedAt ?? owner.queuedAt, now)
        ),
        cpuPercent: cpu ? Math.round(cpu.percent * 10) / 10 : null,
        cpuSeconds: cpu ? Math.round(cpu.seconds * 10) / 10 : null,
        idleSeconds: cpu
          ? Math.round(idleFor(owner, activity, cpu, now) / 1000)
          : null,
      };
    })
  );
  const warnings = ownerDetails
    .filter((owner) => (owner.idleSeconds ?? 0) * 1000 > idleWarningMs)
    .map(
      (owner) =>
        `Owner PID ${owner.pid} (${owner.tool}) has been idle at 0% CPU for ${formatDuration(owner.idleSeconds ?? 0)} (> ${idleWarningMs / 60_000}m). Inspect it; it may be waiting on input or deadlocked. ttr resources never kills owners automatically.`
    );
  const waitingDetails = state.waiting.map((ticket) => ({
    pid: ticket.pid,
    tool: ticket.tool,
    command: ticket.command ?? ticket.tool,
    cwd: ticket.cwd,
    waitedSeconds: Math.round(since(ticket.queuedAt, now)),
  }));
  return { ownerDetails, waitingDetails, warnings };
}

export function renderResourceStatus(result: {
  enabled: boolean;
  machine: { memoryGiB: number; cpus: number };
  limits: { turboConcurrency: number; vitestWorkers: number };
  laneCount: number;
  maxLanes: number;
  effectiveLanes: number;
  occupied: number;
  burst: { eligible: boolean; reason: string };
  ownerDetails: Awaited<
    ReturnType<typeof resourceStatusDetails>
  >['ownerDetails'];
  waitingDetails: Awaited<
    ReturnType<typeof resourceStatusDetails>
  >['waitingDetails'];
  warnings: string[];
}) {
  const lines = [
    `${result.enabled ? 'Enabled' : 'Not enabled'}: ${result.machine.memoryGiB} GiB RAM, ${result.machine.cpus} CPUs`,
    `Limits: ${result.laneCount} base lane(s), max ${result.maxLanes} (host allows ${result.effectiveLanes}), burst ${result.burst.eligible ? 'eligible' : result.burst.reason}, Turbo ${result.limits.turboConcurrency}, Vitest ${result.limits.vitestWorkers}`,
  ];
  if (result.ownerDetails.length) {
    lines.push(`Running (${result.ownerDetails.length}):`);
    for (const owner of result.ownerDetails)
      lines.push(
        `  PID ${owner.pid}${owner.childPid ? `/${owner.childPid}` : ''} ${formatDuration(owner.elapsedSeconds)} CPU ${owner.cpuPercent === null ? 'n/a' : `${owner.cpuPercent}%`}${owner.idleSeconds ? ` idle ${formatDuration(owner.idleSeconds)}` : ''}: ${owner.command} (${owner.cwd})`
      );
  } else
    lines.push(
      `Running: ${result.occupied ? 'initializing or awaiting stale-owner inspection' : 'none'}`
    );
  lines.push(`Waiting: ${result.waitingDetails.length}`);
  for (const ticket of result.waitingDetails)
    lines.push(
      `  PID ${ticket.pid} waited ${formatDuration(ticket.waitedSeconds)}: ${ticket.command} (${ticket.cwd})`
    );
  for (const warning of result.warnings) lines.push(`WARNING: ${warning}`);
  return `${lines.join('\n')}\n`;
}
