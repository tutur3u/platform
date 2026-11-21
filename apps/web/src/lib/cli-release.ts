// The `ttr` CLI ships in the `tuturuuu` npm package.
export const CLI_PACKAGE = 'tuturuuu';
export const CLI_INSTALL_COMMANDS = {
  bun: `bun add -g ${CLI_PACKAGE}`,
  npm: `npm install -g ${CLI_PACKAGE}`,
} as const;
export const CLI_PACKAGE_URL = `https://www.npmjs.com/package/${CLI_PACKAGE}`;

const STABLE_SEMVER = /^\d+\.\d+\.\d+$/;

// Accepts only the registry's `latest` document for this package and a stable
// version, so a malformed or unexpected response shows no version at all.
export function parseCliRelease(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { name, version } = value as Record<string, unknown>;
  if (name !== CLI_PACKAGE || typeof version !== 'string') return null;
  return STABLE_SEMVER.test(version) ? version : null;
}
