const path = require('node:path');

const { getBlueGreenPaths } = require('../docker-web/blue-green.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WATCH_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'watch');
const WATCH_PREBUILD_WORKTREE_DIR = path.join(
  ROOT_DIR,
  'tmp',
  'docker-web',
  'worktrees',
  'production-prebuild'
);
const WATCH_ARGS_FILE_ENV = 'PLATFORM_BLUE_GREEN_WATCH_ARGS_FILE';
const WATCH_RUNTIME_DIR_ENV = 'PLATFORM_BLUE_GREEN_WATCH_RUNTIME_DIR';
const WATCH_STATUS_FILE_ENV = 'PLATFORM_BLUE_GREEN_WATCH_STATUS_FILE';
const WATCH_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.lock'
);
const WATCH_DEPLOYMENT_BUILD_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-deployment-build.lock'
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
const WATCH_DEPLOYMENT_STAGES_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.stages.json'
);
const WATCH_LOG_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.logs.json'
);
const WATCH_GITHUB_CHECKS_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-github-checks.json'
);
const WATCH_CONTROL_DIR = path.join(WATCH_RUNTIME_DIR, 'control');
const WATCH_INSTANT_ROLLOUT_REQUEST_FILE = path.join(
  WATCH_CONTROL_DIR,
  'blue-green-instant-rollout.request.json'
);
const WATCH_PRODUCTION_PROMOTE_REQUEST_FILE = path.join(
  WATCH_CONTROL_DIR,
  'blue-green-production-promote.request.json'
);
const WATCH_DEPLOYMENT_REVERT_REQUEST_FILE = path.join(
  WATCH_CONTROL_DIR,
  'blue-green-deployment-revert.request.json'
);
const WATCH_DEPLOYMENT_PIN_FILE = path.join(
  WATCH_CONTROL_DIR,
  'blue-green-deployment-pin.json'
);
const WATCH_PRODUCTION_PROMOTION_STATE_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-production-promotion.state.json'
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

function readConfiguredPath(envKey, fallback, env = process.env) {
  const configured = env[envKey];

  return typeof configured === 'string' && configured.trim().length > 0
    ? configured.trim()
    : fallback;
}

function getWatchPaths(rootDir = ROOT_DIR, env = process.env) {
  const runtimeDir = readConfiguredPath(
    WATCH_RUNTIME_DIR_ENV,
    path.join(rootDir, 'tmp', 'docker-web', 'watch'),
    env
  );

  return {
    argsFile: readConfiguredPath(
      WATCH_ARGS_FILE_ENV,
      path.join(runtimeDir, 'blue-green-auto-deploy.args.json'),
      env
    ),
    blueGreen: getBlueGreenPaths(rootDir),
    controlDir: path.join(runtimeDir, 'control'),
    deploymentBuildLockFile: path.join(
      runtimeDir,
      'blue-green-deployment-build.lock'
    ),
    deploymentRevertRequestFile: path.join(
      runtimeDir,
      'control',
      'blue-green-deployment-revert.request.json'
    ),
    deploymentPinFile: path.join(
      runtimeDir,
      'control',
      'blue-green-deployment-pin.json'
    ),
    deploymentStagesFile: path.join(
      runtimeDir,
      'blue-green-auto-deploy.stages.json'
    ),
    historyFile: path.join(runtimeDir, 'blue-green-auto-deploy.history.json'),
    githubChecksFile: path.join(runtimeDir, 'blue-green-github-checks.json'),
    instantRolloutRequestFile: path.join(
      runtimeDir,
      'control',
      'blue-green-instant-rollout.request.json'
    ),
    lockFile: path.join(runtimeDir, 'blue-green-auto-deploy.lock'),
    logFile: path.join(runtimeDir, 'blue-green-auto-deploy.logs.json'),
    pendingDeployFile: path.join(
      runtimeDir,
      'blue-green-auto-deploy.pending-deploy.json'
    ),
    productionPromoteRequestFile: path.join(
      runtimeDir,
      'control',
      'blue-green-production-promote.request.json'
    ),
    productionPromotionStateFile: path.join(
      runtimeDir,
      'blue-green-production-promotion.state.json'
    ),
    productionPrebuildWorktreeDir: path.join(
      path.dirname(runtimeDir),
      'worktrees',
      'production-prebuild'
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
    statusFile: readConfiguredPath(
      WATCH_STATUS_FILE_ENV,
      path.join(runtimeDir, 'blue-green-auto-deploy.status.json'),
      env
    ),
  };
}

module.exports = {
  ROOT_DIR,
  WATCH_ARGS_FILE_ENV,
  WATCH_ARGS_FILE,
  WATCH_CONTROL_DIR,
  WATCH_DEPLOYMENT_BUILD_LOCK_FILE,
  WATCH_DEPLOYMENT_REVERT_REQUEST_FILE,
  WATCH_DEPLOYMENT_PIN_FILE,
  WATCH_DEPLOYMENT_STAGES_FILE,
  WATCH_GITHUB_CHECKS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_INSTANT_ROLLOUT_REQUEST_FILE,
  WATCH_PRODUCTION_PROMOTE_REQUEST_FILE,
  WATCH_PRODUCTION_PROMOTION_STATE_FILE,
  WATCH_PREBUILD_WORKTREE_DIR,
  WATCH_LOCK_FILE,
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_REQUEST_LOG_DIR,
  WATCH_REQUEST_STATE_FILE,
  WATCH_REQUEST_SUMMARY_FILE,
  WATCH_RUNTIME_DIR_ENV,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE_ENV,
  WATCH_STATUS_FILE,
  getWatchPaths,
};
