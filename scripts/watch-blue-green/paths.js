const path = require('node:path');

const { getBlueGreenPaths } = require('../docker-web/blue-green.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WATCH_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'watch');
const WATCH_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.lock'
);
const WATCH_HISTORY_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.history.json'
);
const WATCH_STATUS_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.status.json'
);
const WATCH_ARGS_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.args.json'
);
const WATCH_PENDING_DEPLOY_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.pending-deploy.json'
);

function getWatchPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'watch');

  return {
    argsFile: path.join(runtimeDir, 'blue-green-auto-deploy.args.json'),
    blueGreen: getBlueGreenPaths(rootDir),
    historyFile: path.join(runtimeDir, 'blue-green-auto-deploy.history.json'),
    lockFile: path.join(runtimeDir, 'blue-green-auto-deploy.lock'),
    pendingDeployFile: path.join(
      runtimeDir,
      'blue-green-auto-deploy.pending-deploy.json'
    ),
    runtimeDir,
    statusFile: path.join(runtimeDir, 'blue-green-auto-deploy.status.json'),
  };
}

module.exports = {
  ROOT_DIR,
  WATCH_ARGS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  getWatchPaths,
};
