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
const WATCH_LOG_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.logs.json'
);
const WATCH_REQUEST_LOG_DIR = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-request-logs'
);
const WATCH_REQUEST_SUMMARY_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-request-telemetry.summary.json'
);
const WATCH_REQUEST_STATE_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-request-telemetry.state.json'
);

function getWatchPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'watch');

  return {
    argsFile: path.join(runtimeDir, 'blue-green-auto-deploy.args.json'),
    blueGreen: getBlueGreenPaths(rootDir),
    historyFile: path.join(runtimeDir, 'blue-green-auto-deploy.history.json'),
    lockFile: path.join(runtimeDir, 'blue-green-auto-deploy.lock'),
    logFile: path.join(runtimeDir, 'blue-green-auto-deploy.logs.json'),
    pendingDeployFile: path.join(
      runtimeDir,
      'blue-green-auto-deploy.pending-deploy.json'
    ),
    requestLogDir: path.join(runtimeDir, 'blue-green-request-logs'),
    requestSummaryFile: path.join(
      runtimeDir,
      'blue-green-request-telemetry.summary.json'
    ),
    requestStateFile: path.join(
      runtimeDir,
      'blue-green-request-telemetry.state.json'
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
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_REQUEST_LOG_DIR,
  WATCH_REQUEST_STATE_FILE,
  WATCH_REQUEST_SUMMARY_FILE,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  getWatchPaths,
};
