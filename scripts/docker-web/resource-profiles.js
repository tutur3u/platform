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
const BYTES_PER_GIB = 1024 * 1024 * 1024;
const BYTES_PER_MIB = 1024 * 1024;
const AUTO_BUILD_MEMORY_HEADROOM_BYTES = 512 * 1024 * 1024;
const AUTO_BUILD_MEMORY_RESERVE_BYTES = 4 * BYTES_PER_GIB;
const AUTO_BUILD_MEMORY_MIN_BYTES = 6 * BYTES_PER_GIB;
const AUTO_BUILD_MEMORY_HARD_MIN_BYTES = 4 * BYTES_PER_GIB;
const AUTO_BUILD_MEMORY_RATIO = 0.75;

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

function parseMemoryToBytes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([kmgt]i?b?|b)?$/u);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? 'b';
  const multiplier =
    unit === 't' || unit === 'tb' || unit === 'tib'
      ? 1024 * BYTES_PER_GIB
      : unit === 'g' || unit === 'gb' || unit === 'gib'
        ? BYTES_PER_GIB
        : unit === 'm' || unit === 'mb' || unit === 'mib'
          ? BYTES_PER_MIB
          : unit === 'k' || unit === 'kb' || unit === 'kib'
            ? 1024
            : 1;

  return Math.floor(amount * multiplier);
}

function getDockerMemoryLimitBytes(env = {}) {
  return parseMemoryToBytes(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT);
}

function getAutoBuildMemoryBudgetBytes(env = {}) {
  const dockerMemoryLimitBytes = getDockerMemoryLimitBytes(env);

  if (!dockerMemoryLimitBytes) {
    return null;
  }

  const availableAfterHeadroom =
    dockerMemoryLimitBytes - AUTO_BUILD_MEMORY_HEADROOM_BYTES;

  if (availableAfterHeadroom <= 0) {
    return null;
  }

  const conservativeBudget = Math.min(
    Math.floor(dockerMemoryLimitBytes * AUTO_BUILD_MEMORY_RATIO),
    dockerMemoryLimitBytes - AUTO_BUILD_MEMORY_RESERVE_BYTES
  );
  const targetBudget = Math.min(
    availableAfterHeadroom,
    Math.max(AUTO_BUILD_MEMORY_MIN_BYTES, conservativeBudget)
  );

  return Math.max(
    Math.min(availableAfterHeadroom, AUTO_BUILD_MEMORY_HARD_MIN_BYTES),
    targetBudget
  );
}

function formatMemoryBytesAsMib(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  return `${Math.floor(bytes / BYTES_PER_MIB)}m`;
}

function getAutoBuildMemoryBudget(env = {}) {
  return formatMemoryBytesAsMib(getAutoBuildMemoryBudgetBytes(env));
}

function getBuildResourceProfileMemoryBytes(profile, env = {}) {
  if (!profile) {
    return null;
  }

  if (profile.memory === DEFAULT_BUILD_RESOURCE_PROFILE.memory) {
    return getAutoBuildMemoryBudgetBytes(env);
  }

  return parseMemoryToBytes(profile.memory);
}

function isBuildResourceProfileWithinBudget(profile, env = {}) {
  const budgetBytes = getAutoBuildMemoryBudgetBytes(env);
  const profileBytes = getBuildResourceProfileMemoryBytes(profile, env);

  return !budgetBytes || !profileBytes || profileBytes <= budgetBytes;
}

function getRecommendedBuildResourceProfile(_env = {}) {
  return DEFAULT_BUILD_RESOURCE_PROFILE;
}

function getBudgetedBuildResourceProfile(profile, env = {}) {
  if (!profile || isBuildResourceProfileWithinBudget(profile, env)) {
    return profile;
  }

  return getRecommendedBuildResourceProfile(env);
}

function getNextAdaptiveBuildResourceProfile({
  attemptedProfileNames = new Set(),
  currentProfileName,
  env = {},
} = {}) {
  const currentIndex = getBuildResourceProfileIndex(currentProfileName);

  if (currentIndex < 0) {
    return null;
  }

  const nextLowerProfile = BUILD_RESOURCE_PROFILES.slice(currentIndex + 1).find(
    (profile) =>
      !attemptedProfileNames.has(profile.name) &&
      isBuildResourceProfileWithinBudget(profile, env)
  );

  if (nextLowerProfile) {
    return nextLowerProfile;
  }

  const currentProfile = getBuildResourceProfile(currentProfileName);
  const recommendedProfile = getRecommendedBuildResourceProfile(env);

  if (
    currentProfile?.name === 'floor' &&
    recommendedProfile?.name !== currentProfile.name &&
    !attemptedProfileNames.has(recommendedProfile.name)
  ) {
    return recommendedProfile;
  }

  return null;
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

  const profile = getBudgetedBuildResourceProfile(
    getPersistedBuildResourceProfile({ fsImpl, paths }),
    env
  );

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

  return /(?:rpc error:\s*code\s*=\s*Unavailable|closing transport|error reading from server:\s*EOF|received prior goaway|ResourceExhausted|cannot allocate memory|out of memory|exit(?:ed)?(?:\s+with)?\s+code\s+137|exited\s*\(137\)|no space left on device|buildkit.*(?:killed|exited|stopped|restart)|connection reset by peer|context deadline exceeded|waiting for connection|Status:\s*inactive)/iu.test(
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
  getBuildResourceProfileMemoryBytes,
  getBuildResourceProfilePaths,
  getBuildResourceProfilePathsFromEnv,
  getAutoBuildMemoryBudget,
  getAutoBuildMemoryBudgetBytes,
  getBudgetedBuildResourceProfile,
  getNextLowerBuildResourceProfile,
  getNextAdaptiveBuildResourceProfile,
  getRecommendedBuildResourceProfile,
  hasExplicitBuildResourceCliConfig,
  hasExplicitBuildResourceEnv,
  isAdaptiveBuildResourceProfileEnabled,
  isBuildResourceProfileWithinBudget,
  isBuildkitResourceProfileFallbackError,
  isDefaultBuildResourceCliConfig,
  parseMemoryToBytes,
  persistBuildResourceProfile,
  readBuildResourceProfileState,
  shouldUseAdaptiveBuildResourceProfile,
  writeBuildResourceProfileState,
};
