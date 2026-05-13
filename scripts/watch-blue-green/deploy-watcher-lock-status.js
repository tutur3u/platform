const fs = require('node:fs');

const { getWatchPaths } = require('./paths.js');

function readWatchLock(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.lockFile)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(paths.lockFile, 'utf8'));
  } catch {
    return null;
  }
}

function readWatchStatus(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.statusFile)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(paths.statusFile, 'utf8'));
  } catch {
    return null;
  }
}

function serializeWatchStatus(
  state,
  { now = Date.now(), processImpl = process } = {}
) {
  const { logs: _logs, ...serializableState } = state;
  const out = { ...serializableState };

  if (out.lastResult?.error instanceof Error) {
    out.lastResult = {
      ...out.lastResult,
      error: out.lastResult.error.message,
    };
  }

  return {
    ...out,
    ownerPid: processImpl.pid,
    updatedAt: typeof now === 'function' ? now() : now,
  };
}

function writeWatchStatus(
  state,
  {
    fsImpl = fs,
    now = Date.now(),
    paths = getWatchPaths(),
    processImpl = process,
  } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.statusFile,
    JSON.stringify(serializeWatchStatus(state, { now, processImpl }), null, 2),
    'utf8'
  );
}

function clearWatchStatus({
  fsImpl = fs,
  paths = getWatchPaths(),
  processImpl: _processImpl = process,
} = {}) {
  try {
    if (fsImpl.existsSync(paths.statusFile)) {
      fsImpl.unlinkSync(paths.statusFile);
    }
  } catch {
    // ignore
  }
}

function isProcessAlive(pid, processImpl = process) {
  if (!pid || typeof pid !== 'number') {
    return false;
  }

  try {
    processImpl.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === 'object' && error.code !== 'ESRCH';
  }
}

function acquireWatchLock(
  target,
  { fsImpl = fs, paths = getWatchPaths(), processImpl = process } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });

  const existing = readWatchLock(paths, fsImpl);
  if (existing?.pid) {
    if (isProcessAlive(existing.pid, processImpl)) {
      throw new Error(`Watcher already locked by PID ${existing.pid}.`);
    }

    try {
      fsImpl.unlinkSync(paths.lockFile);
    } catch {
      // ignore
    }
  }

  const payload = {
    branch: target.branch,
    createdAt: Date.now(),
    pid: processImpl.pid,
    remote: target.remote,
    upstreamBranch: target.upstreamBranch,
    upstreamRef: target.upstreamRef,
  };

  fsImpl.writeFileSync(
    paths.lockFile,
    JSON.stringify(payload, null, 2),
    'utf8'
  );
}

function releaseWatchLock({
  fsImpl = fs,
  now = Date.now(),
  paths = getWatchPaths(),
  preserveTarget = false,
  processImpl = process,
} = {}) {
  const existing = readWatchLock(paths, fsImpl);
  if (!existing?.pid) {
    return;
  }

  if (existing.pid !== processImpl.pid) {
    return;
  }

  if (preserveTarget) {
    const { pid: _pid, ...targetLock } = existing;
    fsImpl.writeFileSync(
      paths.lockFile,
      JSON.stringify(
        {
          ...targetLock,
          releasedAt: typeof now === 'function' ? now() : now,
        },
        null,
        2
      ),
      'utf8'
    );
    return;
  }

  try {
    fsImpl.unlinkSync(paths.lockFile);
  } catch {
    // ignore
  }
}

module.exports = {
  acquireWatchLock,
  clearWatchStatus,
  isProcessAlive,
  readWatchLock,
  readWatchStatus,
  releaseWatchLock,
  writeWatchStatus,
};
