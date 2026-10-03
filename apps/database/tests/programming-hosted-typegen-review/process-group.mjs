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
    onDiagnostic,
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
      stdio: onDiagnostic ? ['ignore', 'ignore', 'pipe'] : 'ignore',
      env,
      cwd,
    });
    if (onDiagnostic) {
      let pending = '';
      const observed = new Set();
      const patterns = [
        [
          'image-pull',
          /failed to pull|pull access denied|manifest unknown|no matching manifest/i,
        ],
        [
          'container-runtime',
          /OCI runtime|failed to create.*container|Error response from daemon/i,
        ],
        ['service-health', /not healthy|health check failed|unhealthy/i],
        [
          'connection',
          /connection refused|failed to connect|network.*unreachable/i,
        ],
        ['database', /SQLSTATE|ERROR:|FATAL:/],
        [
          'configuration',
          /missing.*environment|invalid.*config|config.*invalid/i,
        ],
      ];
      child.stderr.on('data', (chunk) => {
        pending = (pending + chunk.toString('utf8')).slice(-4096);
        for (const [kind, pattern] of patterns) {
          if (!observed.has(kind) && pattern.test(pending)) {
            observed.add(kind);
            try {
              onDiagnostic(kind);
            } catch (error) {
              abort(error);
              return;
            }
          }
        }
      });
    }
    let failure;
    let settled = false;
    let deadline;
    let monitor;
    let tick;
    const killGroup = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const finish = async (error) => {
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
      const stderr = child.stderr;
      if (stderr && !stderr.destroyed && !stderr.readableEnded) {
        await new Promise((done) => {
          const finishDrain = () => {
            clearTimeout(timer);
            stderr.off('end', finishDrain);
            stderr.off('close', finishDrain);
            done();
          };
          const timer = setTimeout(finishDrain, 250);
          stderr.once('end', finishDrain);
          stderr.once('close', finishDrain);
        });
      }
      stderr?.destroy();
      if (tick) await tick;
      error ??= failure;
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
        if (tick || settled) return;
        tick = Promise.resolve()
          .then(onTick)
          .catch((error) => {
            failure ??= error;
            abort(error);
          })
          .finally(() => {
            tick = undefined;
          });
      }, intervalMs);
    }
  });
}
