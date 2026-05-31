const {
  listProdComposeWatchedRelativePaths,
} = require('../docker-web/prod-compose-include.js');
const { ROOT_DIR } = require('./paths.js');

const SELF_WATCHED_FILES = [
  'scripts/watch-blue-green-deploy.js',
  'scripts/watch-blue-green/deploy-watcher.impl.js',
  'scripts/watch-blue-green/deploy-watcher-git.js',
  'scripts/watch-blue-green/deploy-watcher-lock-status.js',
  'scripts/watch-blue-green/deploy-watcher-watched-paths.js',
  'scripts/docker-web.js',
  'scripts/docker-web/blue-green.js',
  'scripts/docker-web/compose.js',
  'scripts/docker-web/env.js',
];

const CONTAINER_REFRESH_WATCHED_FILES = [
  ...listProdComposeWatchedRelativePaths(ROOT_DIR),
  'apps/backend/',
  'apps/discord/Dockerfile.markitdown',
  'apps/discord/local_server.py',
  'apps/discord/markitdown_service.py',
  'apps/hive/Dockerfile',
  'apps/hive/db/',
  'apps/hive/package.json',
  'apps/hive/next.config.ts',
  'apps/hive-realtime/Dockerfile',
  'apps/hive-realtime/package.json',
  'apps/hive-realtime/src/index.ts',
  'apps/hive-realtime/src/protocol.ts',
  'apps/hive-realtime/src/server.ts',
  'apps/hive-realtime/src/token.ts',
  'apps/meet-realtime/Dockerfile',
  'apps/meet-realtime/src/cloudflare-sfu.ts',
  'apps/meet-realtime/src/index.ts',
  'apps/meet-realtime/src/room-state.ts',
  'apps/meet-realtime/src/server.ts',
  'apps/meet-realtime/src/token.ts',
  'packages/realtime/package.json',
  'packages/realtime/src/index.ts',
  'packages/realtime/src/hive/index.ts',
  'packages/realtime/src/meet/index.ts',
  'packages/realtime/src/meet/token.ts',
  'apps/storage-unzip-proxy/Dockerfile',
  'apps/storage-unzip-proxy/package.json',
  'apps/storage-unzip-proxy/src/server.js',
  'apps/supermemory/',
  'apps/web/docker/blue-green-watcher-entrypoint.js',
  'apps/web/docker/blue-green-watcher.Dockerfile',
];

module.exports = {
  CONTAINER_REFRESH_WATCHED_FILES,
  SELF_WATCHED_FILES,
};
