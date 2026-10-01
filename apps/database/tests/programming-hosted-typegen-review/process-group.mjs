import { spawn } from 'node:child_process';

// Commands are trusted argv arrays; never shell text. Descendants inherit this
// new POSIX group. Docker objects are separate and require scoped cleanup later.
export function runOwnedProcess(
  binary,
  args,
  {
    timeoutMs,
    onTick,
    intervalMs = 2000,
    signalSource = process,
    onSpawn = () => {},
    env = process.env,
    cwd,
  } = {}
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('Owned process requires a finite positive timeout');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      detached: true,
      stdio: 'ignore',
      env,
      cwd,
    });
    let failure;
    let settled = false;
    let deadline;
    let monitor;
    const killGroup = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearInterval(monitor);
      signalSource.off('SIGTERM', interrupt);
      signalSource.off('SIGINT', interrupt);
      try {
        killGroup();
      } catch (killError) {
        error ??= killError;
      }
      if (error) reject(error);
      else resolve();
    };
    const abort = (error) => {
      failure ??= error;
      try {
        killGroup();
      } catch (killError) {
        finish(killError);
      }
    };
    const interrupt = () => abort(new Error('Owned process interrupted'));
    signalSource.once('SIGTERM', interrupt);
    signalSource.once('SIGINT', interrupt);
    child.once('error', finish);
    child.once('exit', (code) =>
      finish(
        failure ?? (code === 0 ? undefined : new Error('Owned process failed'))
      )
    );
    child.once('spawn', () => {
      try {
        onSpawn(child.pid);
      } catch (error) {
        abort(error);
      }
    });
    deadline = setTimeout(
      () => abort(new Error('Owned process time budget exceeded')),
      timeoutMs
    );
    if (onTick) {
      monitor = setInterval(() => {
        try {
          onTick();
        } catch (error) {
          abort(error);
        }
      }, intervalMs);
    }
  });
}
