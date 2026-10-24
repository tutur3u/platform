import {
  type HostRegistry,
  type JobClass,
  proposedHostRegistry,
} from './resources-hosts-config';
import {
  type HostState,
  planAdmissions,
  type Reservation,
  type Waiter,
} from './resources-hosts-plan';

// Offline discrete-event simulation of the planner. It drives the exact
// planAdmissions() used live, so its ceilings, fairness and overlap are
// evidence for the scheduler rather than a model of it.
export interface SimJob {
  id: string;
  project: string;
  jobClass: JobClass;
  arrival: number;
  duration: number;
  remoteOk?: boolean;
}
export interface SimRun {
  id: string;
  project: string;
  jobClass: JobClass;
  hostId: string;
  start: number;
  end: number;
  wait: number;
}
export interface SimResult {
  runs: SimRun[];
  makespan: number;
  meanWait: number;
  maxWait: number;
  peak: Record<string, Record<JobClass, number>>;
  unfinished: string[];
}

export function simulateHosts(
  registry: HostRegistry,
  jobs: SimJob[],
  states: (time: number) => Record<string, HostState> = () =>
    Object.fromEntries(
      registry.hosts.map((host) => [
        host.id,
        { healthy: true, diskFreeGiB: 1e6 },
      ])
    ),
  horizon = 24 * 3600
): SimResult {
  const pending = [...jobs].sort((a, b) => a.arrival - b.arrival);
  const bypassed = new Map<string, number>();
  const running: (SimRun & { reservation: Reservation })[] = [];
  const done: SimRun[] = [];
  const peak: SimResult['peak'] = Object.fromEntries(
    registry.hosts.map((host) => [host.id, { light: 0, heavy: 0 }])
  );
  let time = 0;
  while ((pending.length || running.length) && time <= horizon) {
    for (const run of running.filter((entry) => entry.end <= time)) {
      running.splice(running.indexOf(run), 1);
      const { reservation: _, ...rest } = run;
      done.push(rest);
    }
    const waiting = pending.filter((job) => job.arrival <= time);
    const waiters: Waiter[] = waiting.map((job) => ({
      token: job.id,
      jobClass: job.jobClass,
      project: job.project,
      queuedAt: job.arrival * 1000 + jobs.indexOf(job),
      bypassed: bypassed.get(job.id) ?? 0,
      remoteOk: job.remoteOk ?? true,
    }));
    const plan = planAdmissions(
      registry,
      states(time),
      running.map((run) => run.reservation),
      waiters
    );
    for (const token of plan.bypassed)
      bypassed.set(token, (bypassed.get(token) ?? 0) + 1);
    for (const { token, hostId } of plan.assignments) {
      const job = pending.find((entry) => entry.id === token)!;
      pending.splice(pending.indexOf(job), 1);
      running.push({
        id: job.id,
        project: job.project,
        jobClass: job.jobClass,
        hostId,
        start: time,
        end: time + job.duration,
        wait: time - job.arrival,
        reservation: {
          token,
          hostId,
          jobClass: job.jobClass,
          project: job.project,
          scope: 'host',
        },
      });
    }
    for (const host of registry.hosts)
      for (const jobClass of ['light', 'heavy'] as const)
        peak[host.id]![jobClass] = Math.max(
          peak[host.id]![jobClass],
          running.filter(
            (run) => run.hostId === host.id && run.jobClass === jobClass
          ).length
        );
    const next = [
      ...running.map((run) => run.end),
      ...pending.map((job) => job.arrival).filter((arrival) => arrival > time),
    ];
    if (!next.length) break;
    time = Math.max(time + 1, Math.min(...next));
  }
  const waits = done.map((run) => run.wait);
  return {
    runs: done.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    makespan: Math.max(0, ...done.map((run) => run.end)),
    meanWait: waits.length
      ? waits.reduce((a, b) => a + b, 0) / waits.length
      : 0,
    maxWait: Math.max(0, ...waits),
    peak,
    unfinished: [...pending, ...running].map((job) => job.id),
  };
}

// The measured M4 queue on 2026-10-23: both lanes held by Upskii and nine
// waiters (Upskii and Tuturuuu) of mixed weight. Durations are typical
// medians: full suites 10 min, focused runs 90 s.
export function measuredWorkload(): SimJob[] {
  const heavy = 600;
  const light = 90;
  const jobs: [string, JobClass, number][] = [
    ['upskii', 'heavy', heavy],
    ['upskii', 'heavy', heavy],
    ['upskii', 'heavy', heavy],
    ['tuturuuu', 'heavy', heavy],
    ['upskii', 'light', light],
    ['tuturuuu', 'light', light],
    ['upskii', 'heavy', heavy],
    ['tuturuuu', 'heavy', heavy],
    ['upskii', 'light', light],
    ['tuturuuu', 'light', light],
    ['tuturuuu', 'heavy', heavy],
  ];
  return jobs.map(([project, jobClass, duration], index) => ({
    id: `j${String(index + 1).padStart(2, '0')}-${project}-${jobClass}`,
    project,
    jobClass,
    arrival: index < 2 ? 0 : 1,
    duration,
  }));
}
// Today's single-host policy expressed as a registry: two undifferentiated
// lanes on the M4, so light work waits behind heavy work.
export function currentHostRegistry(): HostRegistry {
  const proposed = proposedHostRegistry();
  const m4 = proposed.hosts[0]!;
  return {
    ...proposed,
    fairness: { maxBypass: 0 },
    hosts: [
      {
        ...m4,
        slots: { light: 0, heavy: 2 },
        weights: { light: m4.weights.heavy, heavy: m4.weights.heavy },
      },
    ],
  };
}
// Today, light jobs occupy a full lane, so model them as heavy.
const asLanes = (jobs: SimJob[]) =>
  jobs.map((job) => ({ ...job, jobClass: 'heavy' as const }));

export function compareWithCurrent(jobs = measuredWorkload()) {
  const current = simulateHosts(currentHostRegistry(), asLanes(jobs));
  const proposed = simulateHosts(proposedHostRegistry(), jobs);
  return { current, proposed };
}
// The operator's offload order (skr-studio > skr-sonha > Linux > M4) as a
// registry. skr-studio and skr-sonha are not registered yet, so their
// capacity here is illustrative (Linux-shaped); only their health is real:
// skr-studio was offline and skr-sonha degraded (load 27 to 32) when the
// order was set. Simulation input only, never written or activated.
export function preferenceRegistry(): HostRegistry {
  const proposed = proposedHostRegistry();
  const linux = proposed.hosts.find((host) => host.id === 'skr-linux-lan')!;
  return {
    ...proposed,
    hosts: [
      ...proposed.hosts,
      { ...linux, id: 'skr-studio', runnerId: 'skr-studio', preference: 1 },
      { ...linux, id: 'skr-sonha', runnerId: 'skr-sonha', preference: 2 },
    ],
  };
}
export function preferenceScenarios(jobs = measuredWorkload()) {
  const registry = preferenceRegistry();
  const healthy: HostState = { healthy: true, diskFreeGiB: 1e6 };
  const all = Object.fromEntries(
    registry.hosts.map((host) => [host.id, healthy])
  );
  const today: Record<string, HostState> = {
    ...all,
    'skr-studio': { healthy: false, reason: 'runner is offline' },
    'skr-sonha': {
      healthy: false,
      reason: 'runner is degraded (load 1.40 per CPU, ceiling 1)',
    },
  };
  return {
    order: [...registry.hosts]
      .sort((a, b) => (a.preference ?? 100) - (b.preference ?? 100))
      .map((host) => host.id),
    today: simulateHosts(registry, jobs, () => today),
    allHealthy: simulateHosts(registry, jobs, () => all),
  };
}
export function renderSimulation(label: string, result: SimResult) {
  const lines = [
    `${label}: makespan ${Math.round(result.makespan / 60)} min, mean wait ${Math.round(result.meanWait / 60)} min, max wait ${Math.round(result.maxWait / 60)} min`,
    ...Object.entries(result.peak).map(
      ([host, peak]) =>
        `  peak ${host}: heavy ${peak.heavy}, light ${peak.light}`
    ),
  ];
  for (const run of result.runs)
    lines.push(
      `  ${run.id.padEnd(24)} ${run.hostId.padEnd(14)} start ${String(Math.round(run.start / 60)).padStart(3)}m end ${String(Math.round(run.end / 60)).padStart(3)}m`
    );
  if (result.unfinished.length)
    lines.push(`  unfinished: ${result.unfinished.join(', ')}`);
  return `${lines.join('\n')}\n`;
}
