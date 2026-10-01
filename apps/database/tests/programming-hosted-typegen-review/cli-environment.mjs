import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const admitted = new WeakMap();
export const hostedDockerEndpoint = 'unix:///var/run/docker.sock';
export const runtimeConfigNames = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.production.local',
  '.env.development.local',
  '.env.test.local',
  'bunfig.toml',
  '.bunfig.toml',
]);
export class CliEnvironmentFailure extends Error {
  constructor() {
    super('Hosted synthetic CLI environment unavailable');
  }
}
function present(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new CliEnvironmentFailure();
  }
}
function privateDirectory(directory) {
  if (!present(directory)) mkdirSync(directory, { mode: 0o700 });
  validatePrivateDirectory(directory);
}
function validatePrivateDirectory(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new CliEnvironmentFailure();
  if (realpathSync(directory) !== directory) throw new CliEnvironmentFailure();
}
export function assertUnlinkedCliDirectory(directory) {
  try {
    let current = realpathSync(directory);
    if (current !== directory) throw new CliEnvironmentFailure();
    while (true) {
      for (const folder of ['.supabase', 'supabase']) {
        const candidate = path.join(current, folder);
        if (present(candidate) && lstatSync(candidate).isSymbolicLink())
          throw new CliEnvironmentFailure();
      }
      // Modern CLI walks ancestors for project.json; legacy uses .temp/project-ref.
      for (const file of [
        '.supabase/project.json',
        'supabase/.temp/project-ref',
        ...runtimeConfigNames,
        ...runtimeConfigNames.map((name) => `supabase/${name}`),
      ]) {
        if (present(path.join(current, file)))
          throw new CliEnvironmentFailure();
      }
      const parent = path.dirname(current);
      if (parent === current) return;
      current = parent;
    }
  } catch {
    throw new CliEnvironmentFailure();
  }
}

// Construct, never spread, the subprocess environment. No ambient credential,
// profile, project, workdir, proxy, debug, loader or Docker configuration survives.
export function createSyntheticCliContext({
  root,
  nativeBinary,
  temporaryRoot,
  workdir,
} = {}) {
  try {
    if (
      ![root, nativeBinary].every(
        (value) => typeof value === 'string' && path.isAbsolute(value)
      )
    )
      throw new CliEnvironmentFailure();
    const parent = realpathSync(path.dirname(root));
    const ownedRoot = path.join(parent, path.basename(root));
    privateDirectory(ownedRoot);
    for (const directory of [
      'home',
      'config',
      'cache',
      'data',
      'state',
      'docker',
      'probe',
      'tmp',
    ])
      privateDirectory(path.join(ownedRoot, directory));
    const temp = temporaryRoot ?? path.join(ownedRoot, 'tmp');
    validatePrivateDirectory(temp);
    const home = path.join(ownedRoot, 'home');
    privateDirectory(path.join(home, 'supabase'));
    for (const file of ['profile', 'access-token', 'profiles']) {
      if (
        present(path.join(home, 'supabase', file)) ||
        present(path.join(home, '.supabase', file))
      )
        throw new CliEnvironmentFailure();
    }
    const cwd = realpathSync(workdir ?? path.join(ownedRoot, 'probe'));
    assertUnlinkedCliDirectory(cwd);
    const env = Object.freeze({
      PATH: '/usr/local/bin:/usr/bin:/bin',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      TERM: 'dumb',
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      HOME: home,
      SUPABASE_HOME: path.join(home, 'supabase'),
      XDG_CONFIG_HOME: path.join(ownedRoot, 'config'),
      XDG_CACHE_HOME: path.join(ownedRoot, 'cache'),
      XDG_DATA_HOME: path.join(ownedRoot, 'data'),
      XDG_STATE_HOME: path.join(ownedRoot, 'state'),
      DOCKER_CONFIG: path.join(ownedRoot, 'docker'),
      DOCKER_HOST: hostedDockerEndpoint,
      TMPDIR: temp,
      SUPABASE_WORKDIR: cwd,
      SUPABASE_CLI_BINARY_OVERRIDE: nativeBinary,
      SUPABASE_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      SUPABASE_NO_KEYRING: '1',
      SUPABASE_INTERNAL_IMAGE_REGISTRY: 'ghcr.io',
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: 'synthetic-ci-only',
      SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: 'synthetic-ci-only',
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: 'synthetic-ci-only',
      SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: 'synthetic-ci-only',
    });
    const directories = [
      ownedRoot,
      temp,
      ...['home', 'config', 'cache', 'data', 'state', 'docker', 'probe'].map(
        (name) => path.join(ownedRoot, name)
      ),
      path.join(home, 'supabase'),
    ];
    admitted.set(env, {
      directories: directories.map((directory) => {
        const { dev, ino } = lstatSync(directory);
        return { directory, dev, ino };
      }),
    });
    assertSyntheticCliEnvironment(env, cwd);
    return { env, cwd };
  } catch {
    throw new CliEnvironmentFailure();
  }
}
export function assertSyntheticCliEnvironment(env, cwd) {
  try {
    const admission = admitted.get(env);
    if (!admission || cwd !== env.SUPABASE_WORKDIR)
      throw new CliEnvironmentFailure();
    for (const { directory, dev, ino } of admission.directories) {
      validatePrivateDirectory(directory);
      const stat = lstatSync(directory);
      if (stat.dev !== dev || stat.ino !== ino)
        throw new CliEnvironmentFailure();
    }
    // These directories may not import persisted runtime or daemon selection.
    for (const directory of [
      env.XDG_CONFIG_HOME,
      env.DOCKER_CONFIG,
      env.SUPABASE_HOME,
    ]) {
      if (readdirSync(directory).length) throw new CliEnvironmentFailure();
    }
    if (readdirSync(env.HOME).some((name) => name !== 'supabase'))
      throw new CliEnvironmentFailure();
    const legacyHome = path.join(env.HOME, '.supabase');
    if (present(legacyHome) && lstatSync(legacyHome).isSymbolicLink())
      throw new CliEnvironmentFailure();
    assertUnlinkedCliDirectory(cwd);
    for (const file of ['profile', 'access-token', 'profiles']) {
      if (
        present(path.join(env.SUPABASE_HOME, file)) ||
        present(path.join(env.HOME, '.supabase', file))
      )
        throw new CliEnvironmentFailure();
    }
  } catch {
    throw new CliEnvironmentFailure();
  }
}
