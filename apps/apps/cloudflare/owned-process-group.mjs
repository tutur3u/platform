import { setTimeout as delay } from 'node:timers/promises';

function alive(group) {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function signal(group, value) {
  try {
    process.kill(-group, value);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function waitForDrain(group, milliseconds) {
  const deadline = performance.now() + milliseconds;
  while (alive(group)) {
    if (performance.now() >= deadline) return false;
    await delay(25);
  }
  return true;
}

/** Drain only the detached process group created by this caller. */
export async function drainOwnedProcessGroup(group) {
  if (!Number.isSafeInteger(group) || group <= 1 || group === process.pid)
    throw new Error('Invalid owned process group');
  if (!alive(group)) return { drained: true, escalated: false };
  signal(group, 'SIGTERM');
  if (await waitForDrain(group, 2_000))
    return { drained: true, escalated: false };
  signal(group, 'SIGKILL');
  if (!(await waitForDrain(group, 2_000)))
    throw new Error('Owned process group did not drain within its deadline');
  return { drained: true, escalated: true };
}

export function ownedProcessGroupAlive(group) {
  return alive(group);
}
