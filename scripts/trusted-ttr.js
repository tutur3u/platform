#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');

function inResourceLane(env = process.env) {
  return Boolean(env.TTR_RESOURCES_ADMITTED || env.TTR_RESOURCE_OWNER);
}

function trustedTtr(home = homedir()) {
  const cli = path.join(home, '.bun/bin/ttr');
  try {
    const entry = fs.realpathSync(cli);
    const relative = path.relative(path.join(home, '.bun/install'), entry);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('global launcher points outside the global installation');
    let root = path.dirname(entry);
    while (!fs.existsSync(path.join(root, 'package.json'))) {
      const parent = path.dirname(root);
      if (parent === root) throw new Error('package manifest missing');
      root = parent;
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
    if (
      manifest.name !== 'tuturuuu' ||
      !version ||
      (Number(version[1]) === 0 && Number(version[2]) < 28) ||
      typeof manifest.bin?.ttr !== 'string' ||
      fs.realpathSync(path.join(root, manifest.bin.ttr)) !== entry
    )
      throw new Error('requires a stable tuturuuu version >= 0.28.0');
    return cli;
  } catch (cause) {
    throw new Error(
      `Trusted global ttr unavailable at ${cli}: ${cause.message}. Run bun add -g tuturuuu to install a stable version >= 0.28.0; workspace or ancestor node_modules binaries are never used.`,
      { cause }
    );
  }
}

function resourceCommand(args, env = process.env) {
  if (!args.length)
    throw new Error('Use node scripts/ttr-run.js -- COMMAND [ARGS...].');
  return inResourceLane(env)
    ? args
    : [trustedTtr(), 'resources', 'run', '--', ...args];
}

function run(args) {
  const divider = args.indexOf('--');
  const command =
    args[0] === 'resources' &&
    args[1] === 'run' &&
    inResourceLane() &&
    divider >= 0
      ? args.slice(divider + 1)
      : [trustedTtr(), ...args];
  if (!command.length) throw new Error('Missing resource command.');
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

module.exports = { trustedTtr, inResourceLane, resourceCommand };
if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
