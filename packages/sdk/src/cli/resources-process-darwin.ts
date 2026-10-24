import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { darwinProcessProbe } from './resources-process-darwin-probe';
import { validProcessPid } from './resources-process-linux';
import type {
  ProcessContext,
  ProcessObservation,
  ProcessRecord,
  ProcessSnapshot,
} from './resources-process-types';

const uuid = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u)
  .refine((value) => value !== '00000000-0000-0000-0000-000000000000');
const pidSchema = z.number().int().positive().max(2_147_483_647);
const probeSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('unavailable'), reason: z.string().max(256) })
    .strict(),
  z
    .object({
      kind: z.literal('ready'),
      context: z
        .object({
          backend: z.literal('darwin-libproc-v1'),
          host: uuid,
          boot: uuid,
          namespace: z.literal('darwin-host'),
        })
        .strict(),
      rows: z
        .array(
          z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('present'),
                pid: pidSchema,
                bytes: z.string().regex(/^[a-f0-9]{384}$/u),
              })
              .strict(),
            z
              .object({
                kind: z.literal('split'),
                pid: pidSchema,
                parent: z.number().int().nonnegative().max(2_147_483_647),
                group: pidSchema,
                status: z.number().int().min(1).max(5),
                unique: z.string().regex(/^[1-9][0-9]{0,19}$/u),
                seconds: z.string().regex(/^[1-9][0-9]{0,18}$/u),
                micros: z.number().int().nonnegative().max(999_999),
              })
              .strict(),
            z.object({ kind: z.literal('gone'), pid: pidSchema }).strict(),
            z
              .object({
                kind: z.literal('unavailable'),
                pid: pidSchema,
                group: z
                  .number()
                  .int()
                  .nonnegative()
                  .max(2_147_483_647)
                  .optional(),
              })
              .strict(),
          ])
        )
        .max(65_536),
      complete: z.boolean(),
    })
    .strict(),
]);

export type DarwinProbeRunner = (
  mode: 'observe' | 'snapshot',
  pid?: number
) => string;
const recovery =
  'macOS kernel identity unavailable. Check process inspection permissions and Apple Command Line Tools (/usr/bin/python3; xcode-select --install), or request support for this macOS libproc ABI.';

const nativeProbe: DarwinProbeRunner = (mode, pid) =>
  execFileSync(
    '/usr/bin/python3',
    [
      '-I',
      '-S',
      '-c',
      darwinProcessProbe,
      mode,
      ...(pid === undefined ? [] : [String(pid)]),
    ],
    {
      encoding: 'utf8',
      cwd: '/',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C' },
      timeout: 5000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

export function parseDarwinProcessBytes(
  bytes: Uint8Array,
  pid: number,
  context: ProcessContext
): ProcessRecord {
  if (
    !validProcessPid(pid) ||
    bytes.byteLength !== 192 ||
    context.backend !== 'darwin-libproc-v1'
  )
    throw new Error('Unsupported Darwin process record ABI');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const status = view.getUint32(4, true);
  const observedPid = view.getUint32(12, true);
  const parent = view.getUint32(16, true);
  const group = view.getUint32(100, true);
  const seconds = view.getBigUint64(120, true);
  const micros = view.getBigUint64(128, true);
  const unique = view.getBigUint64(152, true);
  if (
    observedPid !== pid ||
    ![1, 2, 3, 4, 5].includes(status) ||
    parent > 2_147_483_647 ||
    !validProcessPid(group) ||
    seconds === 0n ||
    micros >= 1_000_000n ||
    unique === 0n
  )
    throw new Error('Invalid Darwin process PID, birth or layout');
  return {
    pid,
    parent,
    group,
    zombie: status === 5,
    identity: { ...context, birth: `${unique}:${seconds}:${micros}` },
  };
}

type DarwinProbeRow = Extract<
  z.infer<typeof probeSchema>,
  { kind: 'ready' }
>['rows'][number];
export type DarwinSplitRow = Extract<DarwinProbeRow, { kind: 'split' }>;

// Cross-user row from flavor 17 + kern.proc.pid, bracketed by equal unique IDs
// in the probe. Its birth matches the flavor 18 string for the same lifetime.
export function parseDarwinSplitRow(
  row: DarwinSplitRow,
  pid: number,
  context: ProcessContext
): ProcessRecord {
  const unique = BigInt(row.unique);
  const seconds = BigInt(row.seconds);
  if (
    row.pid !== pid ||
    !validProcessPid(pid) ||
    context.backend !== 'darwin-libproc-v1' ||
    unique > 18_446_744_073_709_551_615n ||
    seconds > 9_223_372_036_854_775_807n
  )
    throw new Error('Invalid Darwin cross-user process identity');
  return {
    pid,
    parent: row.parent,
    group: row.group,
    zombie: row.status === 5,
    identity: { ...context, birth: `${unique}:${seconds}:${row.micros}` },
  };
}

function probe(
  mode: 'observe' | 'snapshot',
  run: DarwinProbeRunner,
  pid?: number
) {
  try {
    return probeSchema.parse(JSON.parse(run(mode, pid)));
  } catch {
    return {
      kind: 'unavailable',
      reason: recovery,
    } satisfies ProcessObservation;
  }
}

function knownGroup(bytes: Uint8Array, pid: number) {
  if (bytes.byteLength !== 192) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(12, true) !== pid ||
    ![1, 2, 3, 4, 5].includes(view.getUint32(4, true))
  )
    return undefined;
  const group = view.getUint32(100, true);
  return group <= 2_147_483_647 ? group : undefined;
}

export function observeDarwinProcess(
  pid: number,
  run = nativeProbe
): ProcessObservation {
  if (!validProcessPid(pid))
    return {
      kind: 'unavailable',
      reason: 'Process PID must be a positive system PID.',
    };
  const result = probe('observe', run, pid);
  if (result.kind === 'unavailable')
    return { kind: 'unavailable', reason: recovery };
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row || row.pid !== pid)
    return { kind: 'unavailable', reason: recovery };
  if (row.kind === 'gone') return { kind: 'gone' };
  if (row.kind === 'unavailable')
    return { kind: 'unavailable', reason: recovery };
  try {
    return {
      kind: 'present',
      process:
        row.kind === 'split'
          ? parseDarwinSplitRow(row, pid, result.context)
          : parseDarwinProcessBytes(
              Buffer.from(row.bytes, 'hex'),
              pid,
              result.context
            ),
    };
  } catch {
    return { kind: 'unavailable', reason: recovery };
  }
}

export function snapshotDarwinProcesses(run = nativeProbe): ProcessSnapshot {
  const result = probe('snapshot', run);
  if (result.kind === 'unavailable')
    return { kind: 'unavailable', reason: recovery };
  const processes: ProcessRecord[] = [];
  const unavailable: { pid: number; group?: number }[] = [];
  const seen = new Set<number>();
  for (const row of result.rows) {
    if (seen.has(row.pid)) return { kind: 'unavailable', reason: recovery };
    seen.add(row.pid);
    if (row.kind === 'unavailable')
      unavailable.push({
        pid: row.pid,
        ...(row.group === undefined ? {} : { group: row.group }),
      });
    else if (row.kind === 'split') {
      try {
        processes.push(parseDarwinSplitRow(row, row.pid, result.context));
      } catch {
        unavailable.push({ pid: row.pid, group: row.group });
      }
    } else if (row.kind === 'present') {
      const bytes = Buffer.from(row.bytes, 'hex');
      try {
        processes.push(parseDarwinProcessBytes(bytes, row.pid, result.context));
      } catch {
        const group = knownGroup(bytes, row.pid);
        unavailable.push({
          pid: row.pid,
          ...(group === undefined ? {} : { group }),
        });
      }
    }
  }
  return {
    kind: 'ready',
    context: result.context,
    processes,
    unavailable,
    complete: result.complete && unavailable.length === 0,
  };
}
