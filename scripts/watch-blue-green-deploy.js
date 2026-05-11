#!/usr/bin/env node
/**
 * Blue/green deploy watcher — thin entrypoint.
 * Implementation lives in `scripts/watch-blue-green/deploy-watcher.impl.js`
 * so this file stays small; tests and tooling keep importing this path.
 */

const impl = require('./watch-blue-green/deploy-watcher.impl.js');

module.exports = impl;

if (require.main === module) {
  const entrypoint =
    process.env[impl.WATCHER_CONTAINER_ENV] === '1'
      ? impl.main
      : impl.runWatcherCommand;
  void entrypoint();
}
