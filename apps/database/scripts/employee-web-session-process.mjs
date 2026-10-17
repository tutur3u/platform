import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { buildOutputCapture } from './employee-web-session-build-diagnostic.mjs';

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

let sequence = 0;
export function runOwnedBuildProcess(command, args, env, timeoutMs) {
  if (process.env.EMPLOYEE_WEB_SESSION_PROCESS_GROUP !== '1')
    return runOwnedSessionProcess(command, args, {
      cwd: process.cwd(),
      env,
      timeoutMs,
      buildOutput: true,
    });
  if (!process.send || !process.connected)
    throw new Error('Owned build parent unavailable');
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    let timer;
    const clear = () => {
      clearTimeout(timer);
      process.off('message', message);
      process.off('disconnect', disconnect);
    };
    const disconnect = () => {
      clear();
      reject(new Error('Owned build parent disconnected'));
    };
    const message = (value) => {
      if (value?.type !== 'employee-build-result' || value.id !== id) return;
      clear();
      if (value.ok) resolve(value.result);
      else reject(new Error('Owned build process failed'));
    };
    timer = setTimeout(disconnect, timeoutMs + 10000);
    process.on('message', message);
    process.once('disconnect', disconnect);
    try {
      process.send(
        {
          type: 'employee-build',
          id,
          command,
          args,
          env: { ...env },
          timeoutMs,
        },
        (error) => {
          if (error) disconnect();
        }
      );
    } catch {
      disconnect();
    }
  });
}

export async function runOwnedSessionProcess(
  command,
  args,
  {
    cwd,
    input = '',
    timeoutMs,
    env = process.env,
    buildOutput = false,
    signal = undefined,
  }
) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ['pipe', 'pipe', buildOutput ? 'pipe' : 'ignore', 'ipc'],
    env: { ...env, EMPLOYEE_WEB_SESSION_PROCESS_GROUP: '1' },
  });
  let released = false;
  const alive = () => {
    if (released || !child.pid) return false;
    if (!groupExists(child.pid)) {
      released = true;
      return false;
    }
    return true;
  };
  const sendSignal = (value) => {
    if (!alive()) return;
    try {
      process.kill(-child.pid, value);
    } catch (error) {
      if (error.code === 'ESRCH') released = true;
      else throw error;
    }
  };
  let output = '',
    overflow = false,
    timedOut = false,
    closing = false;
  const capture = buildOutput ? buildOutputCapture() : null;
  const controllers = new Set(),
    jobs = [],
    requestIds = new Set();
  const abortJobs = () => {
    for (const controller of controllers) controller.abort();
  };
  let killTimer;
  const stop = () => {
    if (closing) return;
    closing = true;
    timedOut = true;
    abortJobs();
    sendSignal('SIGTERM');
    killTimer = setTimeout(() => sendSignal('SIGKILL'), 3000);
  };
  signal?.addEventListener('abort', stop, { once: true });
  const reply = (value) => {
    if (child.connected) child.send(value, () => {});
  };
  child.on('message', (value) => {
    if (buildOutput || value?.type !== 'employee-build') return;
    const valid =
      !closing &&
      Number.isSafeInteger(value.id) &&
      value.id > 0 &&
      !requestIds.has(value.id) &&
      requestIds.size < 32 &&
      ['bun', 'node'].includes(value.command) &&
      Array.isArray(value.args) &&
      value.args.length <= 32 &&
      value.args.every(
        (arg) => typeof arg === 'string' && arg.length <= 32768
      ) &&
      value.env &&
      typeof value.env === 'object' &&
      !Array.isArray(value.env) &&
      Object.values(value.env).every((entry) => typeof entry === 'string') &&
      Buffer.byteLength(JSON.stringify(value.env)) <= 1048576 &&
      Number.isInteger(value.timeoutMs) &&
      value.timeoutMs > 0 &&
      value.timeoutMs <= 18 * 60_000;
    if (!valid) {
      reply({ type: 'employee-build-result', id: value.id, ok: false });
      return;
    }
    requestIds.add(value.id);
    const controller = new AbortController();
    controllers.add(controller);
    // The outer owner creates the group; fixture death cannot orphan an unregistered build.
    const job = runOwnedSessionProcess(value.command, value.args, {
      cwd,
      env: value.env,
      timeoutMs: value.timeoutMs,
      buildOutput: true,
      signal: controller.signal,
    })
      .then(
        (result) => {
          reply({
            type: 'employee-build-result',
            id: value.id,
            ok: true,
            result,
          });
          return result.processGroupStopped;
        },
        () => {
          reply({ type: 'employee-build-result', id: value.id, ok: false });
          return false;
        }
      )
      .finally(() => controllers.delete(controller));
    jobs.push(job);
  });
  child.stdout.on('data', (chunk) => {
    if (capture) {
      capture.append('stdout', chunk);
      return;
    }
    if (Buffer.byteLength(output) + chunk.length > 8192) {
      overflow = true;
      abortJobs();
      sendSignal('SIGKILL');
    } else output += chunk;
  });
  child.stderr?.on('data', (chunk) => capture?.append('stderr', chunk));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const timer = setTimeout(stop, timeoutMs);
  let closed = false;
  const close = new Promise((resolve) =>
    child.once('close', () => {
      closed = true;
      resolve();
    })
  );
  if (signal?.aborted) stop();
  try {
    const [status, exitSignal] = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, value) => resolve([code, value]));
    });
    closing = true;
    clearTimeout(timer);
    abortJobs();
    sendSignal('SIGTERM');
    for (let attempt = 0; attempt < 30 && alive(); attempt++) await delay(100);
    if (alive()) sendSignal('SIGKILL');
    for (let attempt = 0; attempt < 30 && alive(); attempt++) await delay(100);
    await Promise.race([close, delay(1000)]);
    const nestedStopped = (await Promise.all(jobs)).every(Boolean);
    const processGroupStopped = !alive() && closed && nestedStopped;
    if (buildOutput)
      return {
        status,
        signal: exitSignal,
        timedOut,
        processGroupStopped,
        buildDiagnostic: capture.receipt(),
      };
    return {
      stdout: overflow ? '' : output,
      status: timedOut || overflow ? null : status,
      processGroupStopped,
    };
  } finally {
    closing = true;
    clearTimeout(timer);
    clearTimeout(killTimer);
    signal?.removeEventListener('abort', stop);
    abortJobs();
    if (alive()) sendSignal('SIGKILL');
    await Promise.all(jobs);
    child.stdout.destroy();
    child.stderr?.destroy();
    if (child.connected) child.disconnect();
  }
}
