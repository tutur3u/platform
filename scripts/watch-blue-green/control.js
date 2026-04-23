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
  clearInstantRolloutRequest,
  readInstantRolloutRequest,
  writeInstantRolloutRequest,
};
