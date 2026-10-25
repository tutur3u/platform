import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { BalancerHost } from './balancer-placement';

const weight = z.object({
  cpus: z.number().positive().max(64),
  memoryGiB: z.number().positive().max(512),
});
const hostSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
    transport: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('local') }),
      z.object({
        kind: z.literal('ssh'),
        alias: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
      }),
    ]),
    hostname: z.string().min(1).max(253),
    platform: z.enum(['linux', 'darwin']),
    arch: z.enum(['x64', 'arm64']),
    hold: z.string().min(1).max(200).optional(),
    maxLoadPerCpu: z.number().positive().max(16).optional(),
    minDiskGiB: z.number().min(0).max(100_000),
    minDiskFreePercent: z.number().min(0).max(100).optional(),
    capacity: z.object({
      cpus: z.number().int().min(1).max(512),
      memoryGiB: z.number().positive().max(4096),
    }),
    reserved: z.object({
      cpus: z.number().min(0),
      memoryGiB: z.number().min(0),
      diskGiB: z.number().min(0),
    }),
    weights: z.object({ light: weight, heavy: weight }),
    preference: z.number().int().min(1).max(99).optional(),
  })
  .refine((host) => host.reserved.cpus < host.capacity.cpus, {
    message: 'reserved cpus must leave capacity',
  });
const registrySchema = z.object({
  version: z.literal(1),
  telemetryTtlSeconds: z.number().int().min(10).max(600).default(60),
  hosts: z
    .array(hostSchema)
    .min(1)
    .max(32)
    .refine(
      (hosts) => new Set(hosts.map((host) => host.id)).size === hosts.length,
      {
        message: 'host ids must be unique',
      }
    )
    .refine(
      (hosts) =>
        hosts.filter((host) => host.transport.kind === 'local').length <= 1,
      {
        message: 'at most one local host',
      }
    ),
});
export type BalancerRegistry = {
  telemetryTtlSeconds: number;
  hosts: BalancerHost[];
};

/**
 * `hosts.json` decides where code runs, so it is read only as a regular
 * 0600 file owned by this user (not a symlink), through the opened descriptor.
 */
export async function readBalancerRegistry(
  home: string,
  uid = process.getuid?.() ?? -1
): Promise<BalancerRegistry> {
  const path = join(home, 'hosts.json');
  const info = await lstat(path).catch(() => undefined);
  if (!info)
    throw new Error(
      `No balancer hosts registered. Create ${path} (mode 0600); see the SDK reference.`
    );
  const ok = (entry: { isFile(): boolean; uid: number; mode: number }) =>
    entry.isFile() && entry.uid === uid && (entry.mode & 0o077) === 0;
  if (info.isSymbolicLink() || !ok(info))
    throw new Error(`${path} must be a regular 0600 file owned by you.`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text: string;
  try {
    const opened = await handle.stat();
    if (!ok(opened) || opened.ino !== info.ino)
      throw new Error(`${path} changed while it was checked.`);
    text = await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Invalid ${path}: not valid JSON.`);
  }
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid ${path}: ${issue?.path.join('.') || 'registry'} ${issue?.message ?? 'is invalid'}.`
    );
  }
  return parsed.data;
}
