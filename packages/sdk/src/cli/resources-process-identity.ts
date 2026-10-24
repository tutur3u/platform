import {
  observeDarwinProcess,
  snapshotDarwinProcesses,
} from './resources-process-darwin';
import {
  observeLinuxProcess,
  snapshotLinuxProcesses,
} from './resources-process-linux';
import type {
  KernelProcessIdentity,
  ProcessObservation,
  ProcessSnapshot,
} from './resources-process-types';

export type {
  KernelProcessIdentity,
  ProcessContext,
  ProcessObservation,
  ProcessRecord,
  ProcessSnapshot,
} from './resources-process-types';
export {
  identityEqual,
  processIdentitySchema,
  processRecordSchema,
} from './resources-process-types';

export function observeProcess(pid: number): ProcessObservation {
  if (process.platform === 'linux') return observeLinuxProcess(pid);
  if (process.platform === 'darwin') return observeDarwinProcess(pid);
  return {
    kind: 'unavailable',
    reason:
      'Process ownership requires Linux procfs or a supported macOS libproc ABI. Use a supported host before starting owned work.',
  };
}

export function snapshotProcesses(): ProcessSnapshot {
  if (process.platform === 'linux') return snapshotLinuxProcesses();
  if (process.platform === 'darwin') return snapshotDarwinProcesses();
  return {
    kind: 'unavailable',
    reason:
      'Process inventory requires Linux procfs or a supported macOS libproc ABI.',
  };
}

export function requireProcessIdentity(
  pid = process.pid
): KernelProcessIdentity {
  const result = observeProcess(pid);
  if (result.kind === 'present') return result.process.identity;
  const reason =
    result.kind === 'unavailable'
      ? result.reason
      : 'The process exited before identity capture. Retry the original operation only after reconciling its receipt.';
  throw new Error(
    `Cannot establish process ownership: ${reason} No new owned workload may start; preserve existing reservations until identity is verified.`
  );
}
