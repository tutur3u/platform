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

function isProductionPromoteRequest(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.kind === 'production-promote' &&
    value.sourceBranch === 'main' &&
    value.targetBranch === 'production' &&
    value.bypassChecks === true &&
    value.bypassDelay === true &&
    typeof value.requestedAt === 'string' &&
    typeof value.requestedBy === 'string'
  );
}

function readProductionPromoteRequest(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.productionPromoteRequestFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.productionPromoteRequestFile, 'utf8')
    );

    return isProductionPromoteRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeProductionPromoteRequest(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  if (!isProductionPromoteRequest(request)) {
    throw new Error('Invalid production promote request.');
  }

  fsImpl.mkdirSync(paths.controlDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.productionPromoteRequestFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearProductionPromoteRequest({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.productionPromoteRequestFile, { force: true });
}

function isDeploymentRevertRequest(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.kind === 'deployment-revert' &&
    typeof value.commitHash === 'string' &&
    value.commitHash.length >= 7 &&
    (value.imageTag == null || typeof value.imageTag === 'string') &&
    typeof value.instant === 'boolean' &&
    typeof value.requestedAt === 'string' &&
    typeof value.requestedBy === 'string'
  );
}

function readDeploymentRevertRequest(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.deploymentRevertRequestFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.deploymentRevertRequestFile, 'utf8')
    );

    return isDeploymentRevertRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDeploymentRevertRequest(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  if (!isDeploymentRevertRequest(request)) {
    throw new Error('Invalid deployment revert request.');
  }

  fsImpl.mkdirSync(paths.controlDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.deploymentRevertRequestFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearDeploymentRevertRequest({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.deploymentRevertRequestFile, { force: true });
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
  clearDeploymentRevertRequest,
  clearDeploymentPin,
  clearInstantRolloutRequest,
  clearProductionPromoteRequest,
  readDeploymentRevertRequest,
  readDeploymentPin,
  readInstantRolloutRequest,
  readProductionPromoteRequest,
  writeDeploymentRevertRequest,
  writeDeploymentPin,
  writeInstantRolloutRequest,
  writeProductionPromoteRequest,
};
