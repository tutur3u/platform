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

function serializeWatchStatusValue(value) {
  if (value instanceof Error) {
    return value.message;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeWatchStatusValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'lockToken') {
      continue;
    }

    out[key] = serializeWatchStatusValue(entry);
  }

  return out;
}

function serializeWatchStatus(
  state,
  { now = Date.now(), processImpl = process } = {}
) {
  const { logs: _logs, ...serializableState } = state;
  const out = serializeWatchStatusValue(serializableState);

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
  serializeWatchStatusValue,
  writeWatchStatus,
};
