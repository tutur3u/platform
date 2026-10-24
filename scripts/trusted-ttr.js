#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');

function assertWorkspaceBins(cwd = process.cwd()) {
  const unsafe = [];
  for (
    let directory = fs.realpathSync(cwd);
    ;
    directory = path.dirname(directory)
  ) {
    for (const alias of ['ttr', 'tuturuuu', 'tutur3u']) {
      const file = path.join(directory, 'node_modules/.bin', alias);
      try {
        fs.lstatSync(file);
        const target = fs.realpathSync(file);
        if (
          path.basename(target) !== 'ttr.cjs' ||
          path.basename(path.dirname(target)) !== 'bin'
        )
          unsafe.push(`${file} -> ${target}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (fs.existsSync(path.dirname(file))) {
          try {
            fs.lstatSync(file);
            unsafe.push(`${file} -> broken link`);
          } catch (missing) {
            if (missing.code !== 'ENOENT') throw missing;
          }
        }
      }
    }
    if (path.dirname(directory) === directory) break;
  }
  if (unsafe.length)
    throw new Error(
      `Unsafe ancestor ttr bin links (possibly stale workspace links or orphaned aliases): ${unsafe.join('; ')}. Refusing workspace dist, including with --no-ttr. In the listed ancestor checkout, inspect package.json and ls -l node_modules/tuturuuu node_modules/.bin/{ttr,tuturuuu,tutur3u}. For a declared workspace dependency, run ~/.bun/bin/ttr resources run -- bun install --force to refresh its bin/ttr.cjs aliases; keep the legitimate package link. Only if the manifest has no tuturuuu dependency and these paths are confirmed orphan symlinks to ../packages/sdk and ../tuturuuu/dist/cli/index.js, remove those confirmed links with rm -- node_modules/.bin/{ttr,tuturuuu,tutur3u} node_modules/tuturuuu, then reinstall. bun install alone may leave orphans unchanged. Never remove packages/sdk or legitimate dependency links. See apps/docs/reference/packages/sdk.mdx, Orphan workspace aliases. Use absolute ~/.bun/bin/ttr while recovering.`
    );
}

function inResourceLane(env = process.env) {
  return Boolean(env.TTR_RESOURCES_ADMITTED || env.TTR_RESOURCE_OWNER);
}

function trustedTtr(home = homedir(), cwd = process.cwd()) {
  assertWorkspaceBins(cwd);
  let cli = path.join(home, '.bun/bin/ttr');
  try {
    home = fs.realpathSync(home);
    cli = path.join(home, '.bun/bin/ttr');
    const entry = fs.realpathSync(cli);
    const installBase = fs.realpathSync(path.join(home, '.bun/install'));
    const relative = path.relative(installBase, entry);
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
    const version =
      /^(\d+)\.(\d+)\.(\d+)(?:-dev\.([1-9]\d*)\.([a-f0-9]{7}))?$/.exec(
        manifest.version
      );
    const devIdentityValid =
      !version?.[4] ||
      (manifest.tuturuuuBuild?.channel === 'dev' &&
        /^[a-f0-9]{40}$/.test(manifest.tuturuuuBuild?.sourceSha || '') &&
        manifest.tuturuuuBuild.sourceSha.startsWith(version[5]));
    if (
      manifest.name !== 'tuturuuu' ||
      !version ||
      !devIdentityValid ||
      (Number(version[1]) === 0 && Number(version[2]) < 28) ||
      typeof manifest.bin?.ttr !== 'string' ||
      fs.realpathSync(path.join(root, manifest.bin.ttr)) !== entry
    )
      throw new Error(
        'requires tuturuuu >= 0.28.0 stable or an identified dev build'
      );
    return cli;
  } catch (cause) {
    let missing = false;
    let broken = false;
    if (cause.code === 'ENOENT') {
      try {
        fs.lstatSync(cli);
        broken = true;
      } catch (status) {
        missing = status.code === 'ENOENT';
      }
    }
    const error = new Error(
      `Trusted global ttr unavailable at ${cli}: ${cause.message}.${broken ? ' The global launcher exists but its installation is broken.' : ''} Run bun add -g tuturuuu to install a stable version >= 0.28.0; workspace or ancestor node_modules binaries are never used.`,
      { cause }
    );
    if (missing) error.code = 'TTR_GLOBAL_NOT_INSTALLED';
    throw error;
  }
}

function resourceCommand(args, env = process.env) {
  assertWorkspaceBins();
  if (!args.length)
    throw new Error('Use node scripts/ttr-run.js -- COMMAND [ARGS...].');
  return inResourceLane(env)
    ? args
    : [trustedTtr(), 'resources', 'run', '--', ...args];
}

function run(args) {
  assertWorkspaceBins();
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

module.exports = {
  trustedTtr,
  inResourceLane,
  resourceCommand,
  assertWorkspaceBins,
};
if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
