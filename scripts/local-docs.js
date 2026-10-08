#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function command(argv = [], nodeVersion = process.versions.node) {
  let port = '3000';
  let action = 'dev';
  let print = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--print-command') print = true;
    else if (arg === 'validate' || arg === 'broken-links') action = arg;
    else if (arg === '--port' || arg === '-p') {
      const value = argv[++index];
      if (
        !/^\d+$/.test(value ?? '') ||
        Number(value) < 1 ||
        Number(value) > 65535
      ) {
        throw new Error('Port must be an integer between 1 and 65535.');
      }
      port = value;
    } else throw new Error(`Unknown docs argument: ${arg}`);
  }
  // The local/CI toolchain pin is independent of retained Docker configuration.
  const { version } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'apps/docs/mintlify-version.json'), 'utf8')
  );
  if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
    throw new Error('Invalid Mintlify CLI version.');
  if (!version) throw new Error('Missing pinned Mintlify CLI version.');
  return {
    executable: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: [
      ...(nodeVersion.split('.')[0] === '24'
        ? ['--yes', `mintlify@${version}`]
        : [
            '--yes',
            '--package=node@24',
            `--package=mintlify@${version}`,
            'mintlify',
          ]),
      action,
      ...(action === 'dev' ? ['--port', port] : []),
    ],
    cwd: path.join(ROOT, 'apps/docs'),
    print,
  };
}

function main(argv = process.argv.slice(2)) {
  const plan = command(argv);
  if (plan.print) {
    console.log(JSON.stringify(plan));
    return;
  }
  const result = spawnSync(plan.executable, plan.args, {
    cwd: plan.cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

module.exports = { command, main };
if (require.main === module) main();
