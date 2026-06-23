const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BUILD_RESOURCE_PROFILE_FILE = path.join(
  ROOT_DIR,
  'tmp',
  'docker-web',
  'buildkit',
  'resource-profile.json'
);
const BUILD_RESOURCE_PROFILE_ADAPTIVE_ENV =
  'DOCKER_WEB_BUILD_RESOURCE_PROFILE_ADAPTIVE';
const BUILD_RESOURCE_PROFILE_ENV = 'DOCKER_WEB_BUILD_RESOURCE_PROFILE';
const BUILD_RESOURCE_PROFILE_STATE_FILE_ENV =
  'DOCKER_WEB_BUILD_RESOURCE_PROFILE_STATE_FILE';
const BUILD_RESOURCE_PROFILE_REASON_ENV =
  'DOCKER_WEB_BUILD_RESOURCE_PROFILE_REASON';
const DISABLED_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);
const EXPLICIT_BUILD_RESOURCE_ENV_NAMES = Object.freeze([
  'DOCKER_WEB_BUILD_MEMORY',
  'DOCKER_WEB_BUILD_CPUS',
  'DOCKER_WEB_BUILD_MAX_PARALLELISM',
]);

const BUILD_RESOURCE_PROFILES = Object.freeze([
  Object.freeze({
    cpus: '4',
    maxParallelism: '1',
    memory: 'auto',
    name: 'default',
  }),
  Object.freeze({
    cpus: '2',
    maxParallelism: '1',
    memory: '16g',
    name: 'stable',
  }),
  Object.freeze({
    cpus: '2',
    maxParallelism: '1',
    memory: '10g',
    name: 'low',
  }),
  Object.freeze({
    cpus: '1',
    maxParallelism: '1',
    memory: '8g',
    name: 'minimal',
  }),
  Object.freeze({
    cpus: '1',
    maxParallelism: '1',
    memory: '6g',
    name: 'floor',
  }),
]);

const DEFAULT_BUILD_RESOURCE_PROFILE = BUILD_RESOURCE_PROFILES[0];

function getBuildResourceProfilePaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'buildkit');

  return {
    runtimeDir,
    stateFile: path.join(runtimeDir, 'resource-profile.json'),
  };
}

function getBuildResourceProfile(profileName) {
  return (
    BUILD_RESOURCE_PROFILES.find((profile) => profile.name === profileName) ??
    null
  );
}

function getBuildResourceProfileIndex(profileName) {
  return BUILD_RESOURCE_PROFILES.findIndex(
    (profile) => profile.name === profileName
  );
}

function getNextLowerBuildResourceProfile(profileName) {
  const index = getBuildResourceProfileIndex(profileName);

  if (index < 0 || index >= BUILD_RESOURCE_PROFILES.length - 1) {
    return null;
  }

  return BUILD_RESOURCE_PROFILES[index + 1];
}

function readBuildResourceProfileState(
  paths = getBuildResourceProfilePaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.stateFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.stateFile, 'utf8'));

    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeBuildResourceProfileState(
  state,
  paths = getBuildResourceProfilePaths(),
  fsImpl = fs
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.stateFile,
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
}

function getPersistedBuildResourceProfile({
  fsImpl = fs,
  paths = getBuildResourceProfilePaths(),
} = {}) {
  const state = readBuildResourceProfileState(paths, fsImpl);
  const profile = getBuildResourceProfile(state?.profileName);

  return profile ?? DEFAULT_BUILD_RESOURCE_PROFILE;
}

function isEmptyEnvValue(value) {
  return value == null || String(value).trim() === '';
}

function isAdaptiveBuildResourceProfileDisabled(env = {}) {
  const rawValue = env.DOCKER_WEB_BUILD_RESOURCE_PROFILE_ADAPTIVE;

  return (
    rawValue != null &&
    DISABLED_ENV_VALUES.has(String(rawValue).trim().toLowerCase())
  );
}

function hasExplicitBuildResourceEnv(env = {}) {
  return EXPLICIT_BUILD_RESOURCE_ENV_NAMES.some(
    (name) => !isEmptyEnvValue(env[name])
  );
}

function normalizeBuildResourceValue(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

function isDefaultBuildResourceCliConfig({
  cpus,
  maxParallelism,
  memory,
} = {}) {
  return (
    normalizeBuildResourceValue(memory) ===
      DEFAULT_BUILD_RESOURCE_PROFILE.memory &&
    normalizeBuildResourceValue(cpus) === DEFAULT_BUILD_RESOURCE_PROFILE.cpus &&
    normalizeBuildResourceValue(maxParallelism) ===
      DEFAULT_BUILD_RESOURCE_PROFILE.maxParallelism
  );
}

function hasExplicitBuildResourceCliConfig({
  cpus,
  maxParallelism,
  memory,
} = {}) {
  const hasAnyCliConfig =
    memory != null || cpus != null || maxParallelism != null;

  if (!hasAnyCliConfig) {
    return false;
  }

  return !isDefaultBuildResourceCliConfig({ cpus, maxParallelism, memory });
}

function shouldUseAdaptiveBuildResourceProfile({
  cpus,
  env = {},
  maxParallelism,
  memory,
} = {}) {
  const hasCliConfig = memory != null || cpus != null || maxParallelism != null;

  return (
    hasCliConfig &&
    !isAdaptiveBuildResourceProfileDisabled(env) &&
    !hasExplicitBuildResourceEnv(env) &&
    !hasExplicitBuildResourceCliConfig({ cpus, maxParallelism, memory })
  );
}

function createBuildResourceProfileSelection({
  cpus,
  env = {},
  fsImpl = fs,
  maxParallelism,
  memory,
  paths = getBuildResourceProfilePaths(),
} = {}) {
  if (
    !shouldUseAdaptiveBuildResourceProfile({
      cpus,
      env,
      maxParallelism,
      memory,
    })
  ) {
    return {
      enabled: false,
      profile: null,
      profileName: null,
    };
  }

  const profile = getPersistedBuildResourceProfile({ fsImpl, paths });

  return {
    enabled: true,
    profile,
    profileName: profile.name,
    stateFile: paths.stateFile,
  };
}

function applyBuildResourceProfileToEnv(env = {}, profile) {
  if (!profile) {
    return env;
  }

  return {
    ...env,
    DOCKER_WEB_BUILD_CPUS: profile.cpus,
    DOCKER_WEB_BUILD_MAX_PARALLELISM: profile.maxParallelism,
    DOCKER_WEB_BUILD_MEMORY: profile.memory,
    [BUILD_RESOURCE_PROFILE_ENV]: profile.name,
  };
}

function applyAdaptiveBuildResourceProfileEnv(env = {}, selection) {
  if (!selection?.enabled || !selection.profile) {
    return env;
  }

  return {
    ...applyBuildResourceProfileToEnv(env, selection.profile),
    [BUILD_RESOURCE_PROFILE_ADAPTIVE_ENV]: '1',
    [BUILD_RESOURCE_PROFILE_STATE_FILE_ENV]: selection.stateFile,
  };
}

function getBuildResourceConfigForSelection(selection, fallback = {}) {
  if (!selection?.enabled || !selection.profile) {
    return {
      cpus: fallback.cpus ?? null,
      maxParallelism: fallback.maxParallelism ?? null,
      memory: fallback.memory ?? null,
    };
  }

  return {
    cpus: selection.profile.cpus,
    maxParallelism: selection.profile.maxParallelism,
    memory: selection.profile.memory,
  };
}

function getBuildResourceProfileFromEnv(env = {}) {
  return (
    getBuildResourceProfile(env[BUILD_RESOURCE_PROFILE_ENV]) ??
    DEFAULT_BUILD_RESOURCE_PROFILE
  );
}

function isAdaptiveBuildResourceProfileEnabled(env = {}) {
  return env[BUILD_RESOURCE_PROFILE_ADAPTIVE_ENV] === '1';
}

function getBuildResourceProfilePathsFromEnv(env = {}, rootDir = ROOT_DIR) {
  const stateFile = env[BUILD_RESOURCE_PROFILE_STATE_FILE_ENV];

  if (stateFile && path.isAbsolute(stateFile)) {
    return {
      runtimeDir: path.dirname(stateFile),
      stateFile,
    };
  }

  return getBuildResourceProfilePaths(rootDir);
}

function persistBuildResourceProfile({
  fsImpl = fs,
  previousProfileName,
  profile,
  reason,
  rootDir = ROOT_DIR,
  stateFile,
} = {}) {
  if (!profile) {
    return null;
  }

  const paths = stateFile
    ? {
        runtimeDir: path.dirname(stateFile),
        stateFile,
      }
    : getBuildResourceProfilePaths(rootDir);

  const state = {
    cpus: profile.cpus,
    maxParallelism: profile.maxParallelism,
    memory: profile.memory,
    previousProfileName: previousProfileName ?? null,
    profileName: profile.name,
    reason: reason ?? null,
    updatedAt: new Date().toISOString(),
  };

  writeBuildResourceProfileState(state, paths, fsImpl);

  return state;
}

function isBuildkitResourceProfileFallbackError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return /(?:rpc error:\s*code\s*=\s*Unavailable|closing transport|error reading from server:\s*EOF|received prior goaway|ResourceExhausted|cannot allocate memory|out of memory|no space left on device|buildkit.*(?:killed|exited|stopped|restart)|connection reset by peer)/iu.test(
    message
  );
}

module.exports = {
  BUILD_RESOURCE_PROFILE_ADAPTIVE_ENV,
  BUILD_RESOURCE_PROFILE_ENV,
  BUILD_RESOURCE_PROFILE_FILE,
  BUILD_RESOURCE_PROFILE_REASON_ENV,
  BUILD_RESOURCE_PROFILE_STATE_FILE_ENV,
  BUILD_RESOURCE_PROFILES,
  DEFAULT_BUILD_RESOURCE_PROFILE,
  applyAdaptiveBuildResourceProfileEnv,
  applyBuildResourceProfileToEnv,
  createBuildResourceProfileSelection,
  getBuildResourceConfigForSelection,
  getBuildResourceProfile,
  getBuildResourceProfileFromEnv,
  getBuildResourceProfilePaths,
  getBuildResourceProfilePathsFromEnv,
  getNextLowerBuildResourceProfile,
  hasExplicitBuildResourceCliConfig,
  hasExplicitBuildResourceEnv,
  isAdaptiveBuildResourceProfileEnabled,
  isBuildkitResourceProfileFallbackError,
  isDefaultBuildResourceCliConfig,
  persistBuildResourceProfile,
  readBuildResourceProfileState,
  shouldUseAdaptiveBuildResourceProfile,
  writeBuildResourceProfileState,
};
