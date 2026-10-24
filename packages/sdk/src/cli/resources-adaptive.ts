import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { availableParallelism, loadavg, totalmem } from 'node:os';
import { promisify } from 'node:util';
import {
  effectiveResourceLanes,
  laneResourceConfig,
  type ResourceConfig,
} from './resources-config';
import type { ResourceOwner } from './resources-slots';

const exec = promisify(execFile);
const gib = 1024 ** 3;
export interface BurstTelemetry {
  platform: string;
  cpus: number;
  load: number | undefined;
  totalMemory: number;
  pressureLevel?: number;
  availableMemory?: number;
}
export interface BurstEligibility {
  eligible: boolean;
  reason: string;
}

// Host reads stay outside this decision so missing and stressed telemetry can
// be tested without replacing system binaries or adding production env bypasses.
export function evaluateBurst(
  telemetry: BurstTelemetry,
  estimatedLaneMemory: number
): BurstEligibility {
  const { platform, cpus, load, totalMemory, pressureLevel, availableMemory } =
    telemetry;
  if (
    !Number.isInteger(cpus) ||
    cpus < 1 ||
    load === undefined ||
    !Number.isFinite(load) ||
    load < 0 ||
    !Number.isFinite(totalMemory) ||
    totalMemory <= 0
  )
    return {
      eligible: false,
      reason: 'Burst CPU or memory telemetry is unavailable',
    };
  if (load / cpus >= 0.7)
    return {
      eligible: false,
      reason: 'One-minute CPU load is too high for burst admission',
    };
  if (platform === 'darwin') {
    if (pressureLevel !== 1)
      return {
        eligible: false,
        reason:
          pressureLevel === undefined || !Number.isFinite(pressureLevel)
            ? 'macOS pressure telemetry is unavailable'
            : 'macOS memory pressure is not normal',
      };
  } else if (platform === 'linux') {
    if (
      availableMemory === undefined ||
      !Number.isFinite(availableMemory) ||
      availableMemory < 0
    )
      return {
        eligible: false,
        reason: 'Linux available-memory telemetry is unavailable',
      };
    if (availableMemory < Math.max(totalMemory * 0.25, estimatedLaneMemory))
      return {
        eligible: false,
        reason: 'Linux available memory is below the burst reserve',
      };
  } else
    return {
      eligible: false,
      reason: 'Burst telemetry is unsupported on this platform',
    };
  return {
    eligible: true,
    reason: 'Host pressure and CPU load allow burst admission',
  };
}

export async function burstEligibility(
  config: ResourceConfig
): Promise<BurstEligibility> {
  try {
    const telemetry: BurstTelemetry = {
      platform: process.platform,
      cpus: availableParallelism(),
      load: loadavg()[0],
      totalMemory: totalmem(),
    };
    if (process.platform === 'darwin') {
      const { stdout } = await exec(
        'sysctl',
        ['-n', 'kern.memorystatus_vm_pressure_level'],
        { timeout: 2000 }
      );
      telemetry.pressureLevel = stdout.trim()
        ? Number(stdout.trim())
        : undefined;
    } else if (process.platform === 'linux') {
      const info = await readFile('/proc/meminfo', 'utf8');
      const value = /^MemAvailable:\s+(\d+)/m.exec(info)?.[1];
      telemetry.availableMemory =
        value === undefined ? undefined : Number(value) * 1024;
    }
    const caps = laneResourceConfig(config);
    return evaluateBurst(
      telemetry,
      Math.max(caps.vitestWorkers, caps.buildJobs) * 8 * gib
    );
  } catch {
    return { eligible: false, reason: 'Burst host telemetry is unavailable' };
  }
}

// Lane count is bounded by the effective lane ceiling, not by worker totals.
// Once the aggregate budget is spent, each further (pressure-gated) lane gets
// exactly one worker, so the overcommit is at most one worker per burst lane.
export function admissionResourceConfig(
  config: ResourceConfig,
  owners: ResourceOwner[]
) {
  const caps = laneResourceConfig(config);
  if (owners.length >= effectiveResourceLanes(config)) return undefined;
  const allocated = owners.reduce(
    (total, owner) => ({
      vitestWorkers:
        total.vitestWorkers +
        (owner.limits?.vitestWorkers ?? config.vitestWorkers),
      buildJobs:
        total.buildJobs + (owner.limits?.buildJobs ?? config.buildJobs),
    }),
    { vitestWorkers: 0, buildJobs: 0 }
  );
  const vitestWorkers = Math.max(
    1,
    Math.min(caps.vitestWorkers, config.vitestWorkers - allocated.vitestWorkers)
  );
  const buildJobs = Math.max(
    1,
    Math.min(caps.buildJobs, config.buildJobs - allocated.buildJobs)
  );
  return { ...caps, vitestWorkers, buildJobs };
}
