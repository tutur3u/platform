import { join } from 'node:path';
import { z } from 'zod';
import {
  type RegistryTrustOptions,
  readTrustedRegistryText,
} from './resources-hosts-trust';

// Multi-host weighted admission is opt-in: without `hosts.json` in the
// resources home, admission stays the single-host lane FIFO.
export type JobClass = 'light' | 'heavy';
export const jobClasses: readonly JobClass[] = ['light', 'heavy'];

const weight = z.object({
  cpus: z.number().positive().max(64),
  memoryGiB: z.number().positive().max(512),
});
const hostSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
    // `local` runs on this machine through the lane FIFO; `runner` dispatches
    // through the trusted devbox transport (`ttr box`) to `runnerId`.
    kind: z.enum(['local', 'runner']),
    runnerId: z.string().min(1).optional(),
    // Measured capacity, and headroom reserved for co-tenants (production
    // containers, CI runners, Judge workers, the interactive desktop).
    capacity: z.object({
      cpus: z.number().int().min(1).max(512),
      memoryGiB: z.number().positive().max(4096),
    }),
    reserved: z.object({
      cpus: z.number().min(0),
      memoryGiB: z.number().min(0),
      diskGiB: z.number().min(0),
    }),
    slots: z.object({
      light: z.number().int().min(0).max(16),
      heavy: z.number().int().min(0).max(16),
    }),
    weights: z.object({ light: weight, heavy: weight }),
    // Vitest/Cargo workers granted to one job of each class on this host.
    workers: z.object({
      light: z.number().int().min(1).max(64),
      heavy: z.number().int().min(1).max(64),
    }),
  })
  .refine((host) => host.kind === 'local' || Boolean(host.runnerId), {
    message: 'runner hosts need runnerId',
  })
  .refine((host) => host.reserved.cpus < host.capacity.cpus, {
    message: 'reserved cpus must leave capacity',
  })
  .refine((host) => host.reserved.memoryGiB < host.capacity.memoryGiB, {
    message: 'reserved memory must leave capacity',
  });
export const hostRegistrySchema = z.object({
  version: z.literal(1),
  hosts: z
    .array(hostSchema)
    .min(1)
    .refine(
      (hosts) => new Set(hosts.map((host) => host.id)).size === hosts.length,
      { message: 'host ids must be unique' }
    )
    .refine(
      (hosts) => hosts.filter((host) => host.kind === 'local').length <= 1,
      {
        message: 'at most one local host',
      }
    ),
  fairness: z
    .object({
      // A waiter may be overtaken this many times; then admission holds for it.
      maxBypass: z.number().int().min(0).max(64),
    })
    .default({ maxBypass: 4 }),
  // Runner telemetry older than this is stale and never admitted.
  telemetryTtlSeconds: z.number().int().min(10).max(3600).default(120),
});
export type HostSpec = z.infer<typeof hostSchema>;
export type HostRegistry = z.infer<typeof hostRegistrySchema>;

export const hostRegistryPath = (home: string) => join(home, 'hosts.json');
// Throws UntrustedRegistryError when hosts.json exists but is not trusted.
export async function readHostRegistry(
  home: string,
  trust?: RegistryTrustOptions
) {
  const text = await readTrustedRegistryText(home, trust);
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Invalid hosts.json: not valid JSON.');
  }
  const parsed = hostRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid hosts.json: ${issue?.path.join('.') || 'registry'} ${issue?.message ?? 'is invalid'}.`
    );
  }
  return parsed.data;
}

// Usable budget after reserved headroom.
export function hostBudget(host: HostSpec) {
  return {
    cpus: host.capacity.cpus - host.reserved.cpus,
    memoryGiB: host.capacity.memoryGiB - host.reserved.memoryGiB,
  };
}

// Proposed limits from the 2026-10-23 contention measurements (see the SDK
// reference). Documentation and simulation input only: it is never written
// or activated automatically.
export function proposedHostRegistry(
  linuxRunnerId = 'skr-linux-lan'
): HostRegistry {
  return {
    version: 1,
    fairness: { maxBypass: 4 },
    telemetryTtlSeconds: 120,
    hosts: [
      {
        id: 'm4',
        kind: 'local',
        capacity: { cpus: 10, memoryGiB: 24 },
        reserved: { cpus: 4, memoryGiB: 8, diskGiB: 15 },
        slots: { light: 1, heavy: 2 },
        weights: {
          light: { cpus: 1, memoryGiB: 1 },
          heavy: { cpus: 2, memoryGiB: 5 },
        },
        workers: { light: 1, heavy: 2 },
      },
      {
        id: 'skr-linux-lan',
        kind: 'runner',
        runnerId: linuxRunnerId,
        capacity: { cpus: 20, memoryGiB: 31 },
        reserved: { cpus: 8, memoryGiB: 12, diskGiB: 50 },
        slots: { light: 2, heavy: 2 },
        weights: {
          light: { cpus: 1, memoryGiB: 1 },
          heavy: { cpus: 5, memoryGiB: 6 },
        },
        workers: { light: 1, heavy: 5 },
      },
    ],
  };
}
