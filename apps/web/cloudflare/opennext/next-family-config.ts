import families from './families.json';

type Environment = Record<string, string | undefined>;

export interface OpenNextFamilyNextConfig {
  deploymentId?: string;
  generateBuildId?: () => Promise<string>;
  assetPrefix?: string;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

/**
 * Next config for an OpenNext family build, selected by WEB_OPENNEXT_FAMILY.
 * Unset (every Vercel and local build) returns nothing, so those builds keep
 * their configuration. A family build gets a per-family deployment id, which
 * turns cross-family navigation into a hard navigation, and the exact commit
 * as its build id.
 */
export function openNextFamilyNextConfig(
  env: Environment = process.env
): OpenNextFamilyNextConfig {
  const familyId = env.WEB_OPENNEXT_FAMILY?.trim();
  if (!familyId) return {};
  const family = families.families.find(
    (candidate) => candidate.id === familyId
  );
  if (!family) throw new Error(`Unknown WEB_OPENNEXT_FAMILY: ${familyId}`);
  if (!family.enabled) {
    throw new Error(`WEB_OPENNEXT_FAMILY ${familyId} is declared but held.`);
  }
  const sha = (env.WEB_OPENNEXT_SHA ?? env.GITHUB_SHA ?? '').trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(
      'An OpenNext family build needs WEB_OPENNEXT_SHA or GITHUB_SHA set to the full commit SHA.'
    );
  }
  return {
    deploymentId: `web-${family.id}-${sha.slice(0, 12)}`,
    generateBuildId: async () => sha,
    ...(family.assetPrefix ? { assetPrefix: family.assetPrefix } : {}),
  };
}
