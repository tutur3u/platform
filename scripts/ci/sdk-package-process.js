const { spawn } = require('node:child_process');
const MAX_OUTPUT = 1024 * 1024;

// A detached process group is terminated on deadline/output overflow, then drained.
async function drainGroup(
  pid,
  exists = (group) => {
    try {
      process.kill(-group, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  },
  timeoutMs = 1500
) {
  if (!pid) return;
  const until = Date.now() + timeoutMs;
  do {
    try {
      if (!exists(pid)) return;
    } catch {
      // Darwin can return EPERM while a killed group is exiting. Keep
      // polling within the same deadline; only disappearance proves drain.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < until);
  throw Object.assign(new Error('Owned process group not drained'), {
    code: 'PROCESS_GROUP_UNDRAINED',
    undrainedGroup: pid,
  });
}
/** @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} [options] */
function runProcess(command, args, options = {}) {
  const { cwd, env, timeoutMs = 30000 } = options;
  return new Promise((resolve, reject) => {
    let stdout = '',
      stderr = '',
      bytes = 0,
      stopped,
      killTimer;
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const signal = (value) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, value);
      } catch (error) {
        if (error.code !== 'ESRCH') stopped = 'PROCESS_SIGNAL_FAILED';
      }
    };
    const stop = (reason) => {
      if (stopped) return;
      stopped = reason;
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), 250);
    };
    const timer = setTimeout(() => stop('PROCESS_DEADLINE'), timeoutMs);
    for (const name of ['stdout', 'stderr']) {
      const stream = name === 'stdout' ? child.stdout : child.stderr;
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT) {
          stop('PROCESS_OUTPUT_LIMIT');
          return;
        }
        if (name === 'stdout') stdout += chunk.toString();
        else stderr += chunk.toString();
      });
    }
    child.on('error', (error) => {
      stopped = 'PROCESS_SPAWN';
      stderr = 'code' in error ? String(error.code) : 'spawn failed';
    });
    child.on('close', async (status, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      // Also fence descendants that closed their output streams before the leader.
      signal('SIGKILL');
      try {
        await drainGroup(child.pid);
      } catch (error) {
        reject(error);
        return;
      }
      if (stopped) reject(Object.assign(new Error(stopped), { code: stopped }));
      else resolve({ status, signal: exitSignal, stdout, stderr });
    });
  });
}

module.exports = { runProcess, drainGroup };
