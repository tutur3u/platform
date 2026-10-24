import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
import type {
  ProcessContext,
  ProcessObservation,
  ProcessRecord,
  ProcessSnapshot,
} from './resources-process-types';

export interface LinuxProcessReader {
  text(path: string): string;
  link(path: string): string;
  entries(path: string): string[];
  probe(pid: number): void;
}

const nativeReader: LinuxProcessReader = {
  text: (path) => readFileSync(path, 'utf8'),
  link: (path) => readlinkSync(path),
  entries: (path) => readdirSync(path),
  probe: (pid) => {
    process.kill(pid, 0);
  },
};
const decimal = /^(0|[1-9][0-9]*)$/u;
export const validProcessPid = (pid: number) =>
  Number.isSafeInteger(pid) && pid > 0 && pid <= 2_147_483_647;

function errorCode(error: unknown): string {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'metadata error';
}

// comm may contain spaces, newlines and ')'; fields begin after the last ')'.
export function parseLinuxStat(text: string, pid: number) {
  const close = text.lastIndexOf(')');
  if (!validProcessPid(pid) || !text.startsWith(`${pid} (`) || close < 0)
    throw new Error('Invalid proc stat PID/header');
  const fields = text
    .slice(close + 1)
    .trim()
    .split(/\s+/u);
  const [state, parentText, groupText, sessionText] = fields;
  const birth = fields[19]; // tail index 0 is stat field 3; birth is field 22.
  if (
    !state ||
    !/^[RSDZTWtXxKPI]$/u.test(state) ||
    fields.length < 20 ||
    !parentText ||
    !decimal.test(parentText) ||
    !groupText ||
    !decimal.test(groupText) ||
    !sessionText ||
    !decimal.test(sessionText) ||
    !birth ||
    !decimal.test(birth) ||
    birth.length > 20 ||
    BigInt(birth) > 18_446_744_073_709_551_615n
  )
    throw new Error('Invalid proc stat fields');
  const parent = Number(parentText);
  const group = Number(groupText);
  const session = Number(sessionText);
  if (
    ![parent, group, session].every(
      (value) => Number.isSafeInteger(value) && value <= 2_147_483_647
    )
  )
    throw new Error('Invalid proc stat identifiers');
  return { pid, parent, group, session, birth, zombie: state === 'Z' };
}

function context(reader: LinuxProcessReader): ProcessContext {
  const host = reader.text('/etc/machine-id').trim();
  const boot = reader.text('/proc/sys/kernel/random/boot_id').trim();
  const namespace = reader.link('/proc/self/ns/pid');
  if (
    !/^[a-fA-F0-9]{32}$/u.test(host) ||
    /^0{32}$/u.test(host) ||
    !/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/u.test(boot) ||
    boot === '00000000-0000-0000-0000-000000000000' ||
    !/^pid:\[[1-9][0-9]*\]$/u.test(namespace)
  )
    throw new Error('Invalid Linux host, boot or PID namespace metadata');
  // A procfs mounted for a different PID namespace cannot describe our PIDs.
  parseLinuxStat(reader.text('/proc/self/stat'), process.pid);
  return {
    backend: 'linux-proc-v1',
    host: host.toLowerCase(),
    boot: boot.toLowerCase(),
    namespace,
  };
}

type LinuxObservation = { observation: ProcessObservation; group?: number };
function observe(
  pid: number,
  scope: ProcessContext,
  reader: LinuxProcessReader
): LinuxObservation {
  let group: number | undefined;
  try {
    const stat = parseLinuxStat(reader.text(`/proc/${pid}/stat`), pid);
    group = stat.group;
    // Kernel threads report group 0. Their exact birth still disproves an
    // older lifetime at the PID, and 0 never matches a positive owner group.
    const record: ProcessRecord = {
      pid,
      parent: stat.parent,
      group,
      identity: { ...scope, birth: stat.birth },
      zombie: stat.zombie,
    };
    return { observation: { kind: 'present', process: record } };
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ESRCH') {
      try {
        reader.probe(pid);
      } catch (probeError) {
        if (errorCode(probeError) === 'ESRCH')
          return { observation: { kind: 'gone' } };
      }
    }
    return {
      observation: {
        kind: 'unavailable',
        reason: `Linux process metadata unavailable (${errorCode(error)}). Check procfs visibility and permissions.`,
      },
      ...(group === undefined ? {} : { group }),
    };
  }
}

export function observeLinuxProcess(
  pid: number,
  reader = nativeReader
): ProcessObservation {
  if (!validProcessPid(pid))
    return {
      kind: 'unavailable',
      reason: 'Process PID must be a positive system PID.',
    };
  try {
    return observe(pid, context(reader), reader).observation;
  } catch {
    return {
      kind: 'unavailable',
      reason:
        'Linux identity context unavailable. Mount readable procfs and provide /etc/machine-id, boot_id and PID namespace metadata.',
    };
  }
}

export function snapshotLinuxProcesses(reader = nativeReader): ProcessSnapshot {
  try {
    const scope = context(reader);
    // hidepid can silently omit rows, making an apparently empty group unsafe.
    const mounts = reader.text('/proc/self/mountinfo');
    const procMount = mounts.split('\n').find((line) => {
      const [before, after] = line.split(' - ');
      return before?.split(' ')[4] === '/proc' && after?.startsWith('proc ');
    });
    if (
      !procMount ||
      /(?:^|[ ,])hidepid=(?!0(?:[, ]|$))[^, ]+/u.test(procMount)
    )
      return {
        kind: 'unavailable',
        reason:
          'Linux process inventory is restricted or procfs mount visibility is unknown. Use a procfs view without hidepid restrictions.',
      };
    const pids = reader
      .entries('/proc')
      .filter((entry) => /^[1-9][0-9]*$/u.test(entry))
      .map(Number);
    if (pids.length > 131_072 || pids.some((pid) => !validProcessPid(pid)))
      return {
        kind: 'unavailable',
        reason:
          'Linux process inventory exceeds the supported bounded PID range.',
      };
    const processes: ProcessRecord[] = [];
    const unavailable: { pid: number; group?: number }[] = [];
    for (const pid of pids) {
      const result = observe(pid, scope, reader);
      if (result.observation.kind === 'present')
        processes.push(result.observation.process);
      else if (result.observation.kind === 'unavailable')
        unavailable.push({
          pid,
          ...(result.group === undefined ? {} : { group: result.group }),
        });
    }
    return {
      kind: 'ready',
      context: scope,
      processes,
      unavailable,
      complete: unavailable.length === 0,
    };
  } catch {
    return {
      kind: 'unavailable',
      reason:
        'Linux process inventory unavailable. Check procfs, machine identity and permissions.',
    };
  }
}
