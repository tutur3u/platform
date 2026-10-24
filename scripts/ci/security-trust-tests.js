#!/usr/bin/env node
// Runs the workflow trust-boundary suites for security-checks.yaml. Fork pull
// requests do not run the push-only root script suite, so these run here too.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const required = [
  'check-workflow-config.test.js',
  'protected-workflow-concurrency.test.js',
  'security-workflows.test.js',
];

function trustSuites(files = fs.readdirSync(dir)) {
  const discovered = files.filter(
    (file) =>
      /^(?:workflow|security)-[\w-]+\.test\.js$/u.test(file) ||
      required.includes(file)
  );
  for (const file of required) {
    if (!discovered.includes(file))
      throw new Error(`missing trust suite ${file}`);
  }
  return [...new Set(discovered)].sort();
}

if (require.main === module) {
  const suites = trustSuites().map((file) => path.join(dir, file));
  console.log(`Running ${suites.length} trust-boundary suites.`);
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=2', ...suites],
    { stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

module.exports = { required, trustSuites };
