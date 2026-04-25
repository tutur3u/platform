const fs = require('node:fs');

const { getWatchPaths } = require('./paths.js');

function readInstantRolloutRequest(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.instantRolloutRequestFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.instantRolloutRequestFile, 'utf8')
    );

    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.kind === 'sync-standby' &&
      typeof parsed.requestedAt === 'string' &&
      typeof parsed.requestedBy === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isDeploymentPin(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.kind === 'deployment-pin' &&
    typeof value.commitHash === 'string' &&
    value.commitHash.length >= 7 &&
    typeof value.requestedAt === 'string' &&
    typeof value.requestedBy === 'string'
  );
}

function readDeploymentPin(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.deploymentPinFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.deploymentPinFile, 'utf8')
    );

    return isDeploymentPin(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDeploymentPin(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  if (!isDeploymentPin(request)) {
    throw new Error('Invalid deployment pin request.');
  }

  fsImpl.mkdirSync(paths.controlDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.deploymentPinFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearDeploymentPin({ fsImpl = fs, paths = getWatchPaths() } = {}) {
  fsImpl.rmSync(paths.deploymentPinFile, { force: true });
}

function writeInstantRolloutRequest(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.controlDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.instantRolloutRequestFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearInstantRolloutRequest({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.instantRolloutRequestFile, { force: true });
}

module.exports = {
  clearDeploymentPin,
  clearInstantRolloutRequest,
  readDeploymentPin,
  readInstantRolloutRequest,
  writeDeploymentPin,
  writeInstantRolloutRequest,
};
