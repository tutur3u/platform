import type { TuturuuuUserClient } from '../platform';
import { runnerMaintenanceBlocker } from '../platform-devbox-fleet';
import { type FlagValue, getFlag } from './args';
import {
  createDevboxRestartPayload,
  createDevboxUpgradePayload,
} from './devbox-maintenance';
import { compareVersions } from './update';

export async function runDevboxFleetCommand({
  action,
  client,
  flags,
  json,
}: {
  action: string;
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  const snapshot = await client.devboxes.fleet.snapshot();
  const output = (value: unknown) =>
    process.stdout.write(
      `${JSON.stringify(value, null, json ? undefined : 2)}\n`
    );
  if (action === 'runners') {
    output({ runners: snapshot.runners });
    return;
  }
  const ids =
    getFlag(flags, 'runners')
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  const id = getFlag(flags, 'runner');
  if (id) ids.push(id);
  if (ids.length && flags.all === true)
    throw new Error(
      'Use either --all or an explicit runner selection, not both.'
    );
  if (!ids.length && flags.all !== true)
    throw new Error('Select --runner <id>, --runners <id,id>, or --all.');
  for (const selected of ids) {
    if (!snapshot.runners.some((runner) => runner.id === selected))
      throw new Error(`Runner not found: ${selected}`);
  }
  const runners = snapshot.runners.filter(
    (runner) => flags.all === true || ids.includes(runner.id)
  );
  if (action === 'inspect') {
    output({
      runners: runners.map((runner) => ({
        ...runner,
        maintenanceBlocker: runnerMaintenanceBlocker(snapshot, runner) ?? null,
        runs: snapshot.runs.filter((run) => run.runner_id === runner.id),
        leases: snapshot.leases.filter(
          (lease) => lease.runner_id === runner.id
        ),
      })),
    });
    return;
  }
  if (action !== 'upgrade' && action !== 'restart')
    throw new Error('Unsupported fleet action');
  if (flags.apply === true && flags['dry-run'] === true)
    throw new Error('Choose either --apply or --dry-run.');
  const plan = runners.map((runner) => ({
    id: runner.id,
    name: runner.name,
    blocker: runnerMaintenanceBlocker(snapshot, runner) ?? null,
  }));
  if (flags.apply !== true) {
    output({ action, apply: false, plan });
    return;
  }
  // Stop on the first failure. Re-read eligibility before every mutation.
  let expectedVersion: string | undefined;
  if (action === 'upgrade') {
    const response = await fetch('https://registry.npmjs.org/tuturuuu/latest', {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Cannot resolve the latest CLI release');
    const payload = (await response.json()) as { version?: string };
    if (!payload.version || !/^\d+\.\d+\.\d+$/u.test(payload.version))
      throw new Error('Registry latest is not a stable release');
    expectedVersion = payload.version;
  }
  const results: { runnerId: string; runId?: string; skipped?: string }[] = [];
  for (const runner of runners) {
    const fresh = await client.devboxes.fleet.snapshot();
    const current = fresh.runners.find((row) => row.id === runner.id);
    const blocker = current
      ? runnerMaintenanceBlocker(fresh, current)
      : 'Runner disappeared';
    if (blocker) {
      results.push({ runnerId: runner.id, skipped: blocker });
      continue;
    }
    const payload =
      action === 'upgrade'
        ? createDevboxUpgradePayload({ ...flags, runner: runner.id })
        : createDevboxRestartPayload({ ...flags, runner: runner.id });
    let result = await client.devboxes.createRun(payload);
    const deadline = Date.now() + (payload.timeoutSeconds + 30) * 1000;
    while (['queued', 'claimed', 'running'].includes(result.run.status)) {
      if (Date.now() >= deadline) {
        let cancellation =
          'Stop requested; verify the runner has released the lease before retrying.';
        try {
          await client.devboxes.stopRun(result.run.id);
        } catch {
          cancellation =
            'Stop request failed; inspect this run and its lease before retrying.';
        }
        throw new Error(
          `Timed out waiting for maintenance run ${result.run.id}. ${cancellation} Remaining runners were not changed.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await client.devboxes.getRun(result.run.id);
    }
    if (result.run.status !== 'succeeded' || result.run.exitCode !== 0)
      throw new Error(
        `Maintenance run ${result.run.id} failed; remaining runners were not changed.`
      );
    // A completed command does not prove the supervised service restarted.
    const completedAt = Date.now();
    let healthy = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const after = await client.devboxes.fleet.snapshot();
      const reported = after.runners.find((row) => row.id === runner.id);
      if (
        reported?.status === 'online' &&
        Date.parse(reported.last_heartbeat_at ?? '') > completedAt &&
        (!expectedVersion ||
          (reported.capabilities?.cli?.version &&
            /^\d+\.\d+\.\d+$/u.test(reported.capabilities.cli.version) &&
            compareVersions(
              reported.capabilities.cli.version,
              expectedVersion
            ) >= 0))
      ) {
        healthy = true;
        break;
      }
    }
    if (!healthy)
      throw new Error(
        `Runner ${runner.id} did not report a new healthy heartbeat; inspect its service before continuing.`
      );
    results.push({ runnerId: runner.id, runId: result.run.id });
  }
  output({ action, apply: true, results });
}
