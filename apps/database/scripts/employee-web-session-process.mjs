import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function runOwnedSessionProcess(
  command,
  args,
  { cwd, input, timeoutMs, env = process.env }
) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...env, EMPLOYEE_WEB_SESSION_PROCESS_GROUP: '1' },
  });
  let output = '';
  let overflow = false;
  let timedOut = false;
  child.stdout.on('data', (chunk) => {
    if (Buffer.byteLength(output) + chunk.length > 8192) {
      overflow = true;
      if (child.pid) signalGroup(child.pid, 'SIGKILL');
    } else output += chunk;
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) signalGroup(child.pid, 'SIGTERM');
  }, timeoutMs);
  const killTimer = setTimeout(() => {
    if (child.pid) signalGroup(child.pid, 'SIGKILL');
  }, timeoutMs + 3000);
  try {
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    });
    if (!child.pid) throw new Error('Owned session process absent');
    // The leader may have exited while descendants still hold the same group.
    signalGroup(child.pid, 'SIGTERM');
    for (let attempt = 0; attempt < 30 && groupExists(child.pid); attempt++)
      await delay(100);
    if (groupExists(child.pid)) signalGroup(child.pid, 'SIGKILL');
    for (let attempt = 0; attempt < 30 && groupExists(child.pid); attempt++)
      await delay(100);
    return {
      stdout: overflow ? '' : output,
      status: timedOut || overflow ? null : status,
      processGroupStopped: !groupExists(child.pid),
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    if (child.pid && groupExists(child.pid)) signalGroup(child.pid, 'SIGKILL');
  }
}
