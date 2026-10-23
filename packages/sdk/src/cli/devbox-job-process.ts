import { spawn } from 'node:child_process';

export const DEVBOX_JOB_KILL_GRACE_MS = 10_000;
export const DEVBOX_CANCEL_CHECK_MS = 10_000;

// Jobs are spawned detached, so the job's pid is also its process group id.
// Never fall back to signalling the bare pid: once the group is gone that pid
// can belong to an unrelated, reused process.
export function signalProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}
export function processGroupExists(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface ProcessGroupOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  graceMs?: number;
  cancelSignal?: AbortSignal;
  checkCancel?: () => Promise<boolean>;
  cancelCheckMs?: number;
  onOutput: (chunk: string) => void;
}

// Each job leads its own process group so a timeout or stop reaches every
// descendant (shells, Docker CLIs, test workers), not only the direct child:
// SIGTERM to the group, then SIGKILL to anything left after the grace period.
export async function runProcessGroup(options: ProcessGroupOptions) {
  const graceMs = options.graceMs ?? DEVBOX_JOB_KILL_GRACE_MS;
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    detached: true,
  });
  let reason: 'timeout' | 'cancel' | undefined;
  let settled = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = (why: 'timeout' | 'cancel') => {
    if (settled || reason || !child.pid) return;
    reason = why;
    const pid = child.pid;
    signalProcessGroup(pid, 'SIGTERM');
    killTimer = setTimeout(() => signalProcessGroup(pid, 'SIGKILL'), graceMs);
  };
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => terminate('timeout'), options.timeoutMs);
  const onAbort = () => terminate('cancel');
  options.cancelSignal?.addEventListener('abort', onAbort, { once: true });
  let checking = false;
  const poller = options.checkCancel
    ? setInterval(() => {
        if (checking || reason) return;
        checking = true;
        options.checkCancel!()
          .then((cancel) => {
            if (cancel) terminate('cancel');
          })
          .catch(() => {
            /* A failed check retries on the next interval. */
          })
          .finally(() => {
            checking = false;
          });
      }, options.cancelCheckMs ?? DEVBOX_CANCEL_CHECK_MS)
    : undefined;
  if (options.cancelSignal?.aborted) onAbort();
  child.stdout?.on('data', (chunk) => options.onOutput(String(chunk)));
  child.stderr?.on('data', (chunk) => options.onOutput(String(chunk)));

  try {
    const exit = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    if (reason && child.pid) {
      // Descendants that ignored SIGTERM still die at the grace deadline.
      const deadline = Date.now() + graceMs;
      while (processGroupExists(child.pid) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (processGroupExists(child.pid))
        signalProcessGroup(child.pid, 'SIGKILL');
    }
    return {
      ...exit,
      timedOut: reason === 'timeout',
      cancelled: reason === 'cancel',
    };
  } finally {
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
    if (poller) clearInterval(poller);
    options.cancelSignal?.removeEventListener('abort', onAbort);
  }
}
