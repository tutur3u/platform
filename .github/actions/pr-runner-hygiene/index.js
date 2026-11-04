const fs = require('node:fs');
const path = require('node:path');

function prepare(env = process.env) {
  const temp = fs.realpathSync(env.RUNNER_TEMP);
  const workspace = fs.realpathSync(env.GITHUB_WORKSPACE);
  if (workspace === path.parse(workspace).root || workspace === env.HOME) {
    throw new Error('Refusing an unsafe workspace');
  }
  const root = fs.mkdtempSync(path.join(temp, 'pr-runner-'));
  fs.chmodSync(root, 0o700);
  const stat = fs.statSync(workspace);
  const state = { temp, root, workspace, dev: stat.dev, ino: stat.ino };
  fs.appendFileSync(env.GITHUB_STATE, `pr_runner=${JSON.stringify(state)}\n`);
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const variables = {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_CACHE_HOME: path.join(root, 'cache'),
    BUN_INSTALL: path.join(root, 'bun'),
    BUN_INSTALL_CACHE_DIR: path.join(root, 'bun-cache'),
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_ignore_scripts: 'true',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
  fs.appendFileSync(
    env.GITHUB_ENV,
    `${Object.entries(variables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
  return state;
}

function cleanup(state) {
  const { temp, root, workspace, dev, ino } = state;
  if (
    path.dirname(root) !== temp ||
    !path.basename(root).startsWith('pr-runner-') ||
    workspace === path.parse(workspace).root ||
    workspace === temp
  ) {
    throw new Error('Refusing an unsafe cleanup path');
  }
  const stat = fs.lstatSync(workspace);
  if (stat.isSymbolicLink() || stat.dev !== dev || stat.ino !== ino) {
    throw new Error(
      'Workspace identity changed; runner requires operator cleanup'
    );
  }
  for (const entry of fs.readdirSync(workspace)) {
    fs.rmSync(path.join(workspace, entry), { recursive: true, force: true });
  }
  fs.rmSync(root, { recursive: true, force: true });
}

if (require.main === module) {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: GitHub post-action state is outside Turbo.
  const state = process.env.STATE_pr_runner;
  if (state) cleanup(JSON.parse(state));
  else prepare();
}
module.exports = { prepare, cleanup };
