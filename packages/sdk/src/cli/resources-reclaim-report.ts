import { join } from 'node:path';
import {
  numberedSlotPaths,
  ownerAndGroupGone,
  ownerState,
  processAlive,
  type ResourceOwner,
  trustedPs,
} from './resources-slots';

const maxPid = 0x7fffffff;
const maxGroupMembers = 8;

// Read-only explanation for a numbered slot that reclaim keeps. Reclaim waits
// for the recorded broker, child and every process in the child's group, so the
// preview names the survivor rather than reporting an apparently empty lane.
// Nothing here signals a process or changes a receipt.
function groupMembers(group: number) {
  try {
    return trustedPs(['-axo', 'pid=,pgid=,stat='], 3000)
      .split('\n')
      .flatMap((row) => {
        const [pid, pgid, state] = row.trim().split(/\s+/);
        if (Number(pgid) !== group) return [];
        return [`${pid}${state?.startsWith('Z') ? ' (zombie)' : ''}`];
      });
  } catch {
    return undefined;
  }
}

export function formatGroupMembers(members: string[]) {
  if (members.length <= maxGroupMembers) return members.join(', ');
  const shown = members.slice(0, maxGroupMembers).join(', ');
  return `${shown}, and ${members.length - maxGroupMembers} more`;
}

function survivor(owner: ResourceOwner) {
  if (owner.pid > maxPid)
    return `broker PID ${owner.pid} is out of range and cannot be proven absent`;
  if (processAlive(owner.pid)) return `broker PID ${owner.pid} is alive`;
  if (owner.childPid === undefined)
    return 'the recorded owner cannot be proven absent';
  if (owner.childPid > maxPid)
    return `child PID ${owner.childPid} is out of range and cannot be proven absent`;
  if (processAlive(owner.childPid))
    return `child PID ${owner.childPid} is alive`;
  const members = groupMembers(owner.childPid);
  return members?.length
    ? `child process group ${owner.childPid} still has process(es) ${formatGroupMembers(members)}`
    : `child process group ${owner.childPid} still exists`;
}

export async function keptResourceSlots(home: string) {
  const kept: { path: string; reason: string }[] = [];
  for (const path of await numberedSlotPaths(home)) {
    const state = await ownerState(join(path, 'owner.json'));
    if (state.kind === 'owner' && !ownerAndGroupGone(state.owner))
      kept.push({ path, reason: survivor(state.owner) });
  }
  return kept;
}

export async function reclaimReport(
  home: string,
  slots: { path: string; backup?: string }[],
  apply: boolean,
  inspectKept: (
    home: string
  ) => Promise<{ path: string; reason: string }[]> = keptResourceSlots
) {
  const lines = slots.map((slot) =>
    slot.backup
      ? `Reclaimed ${slot.path}. Receipt backed up to ${slot.backup}\n`
      : `Would reclaim ${slot.path}.\n`
  );
  if (!slots.length) lines.push('No dead resource slots to reclaim.\n');
  else if (!apply)
    lines.push('Use --apply to back up receipts and reclaim these slots.\n');
  try {
    for (const { path, reason } of await inspectKept(home))
      lines.push(
        `Kept ${path}: ${reason}. It becomes reclaimable only after every process it names exits.\n`
      );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    lines.push(
      `Warning: could not inspect remaining resource slots: ${detail}\n`
    );
  }
  return lines.join('');
}
