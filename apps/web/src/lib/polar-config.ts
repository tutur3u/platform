import { DEV_MODE } from '@tuturuuu/utils/constants';

type PolarWorkspaceSetupEnv = Record<string, string | undefined>;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const PLACEHOLDER_VALUES = new Set([
  'change-me',
  'changeme',
  'development',
  'dummy',
  'local',
  'none',
  'null',
  'placeholder',
  'test',
  'undefined',
]);

function normalizeEnvValue(value?: string) {
  return value?.trim();
}

function parseBooleanEnv(value?: string): boolean | null {
  const normalized = normalizeEnvValue(value)?.toLowerCase();
  if (!normalized) return null;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function hasUsablePolarCredential(value?: string) {
  const normalized = normalizeEnvValue(value);
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  return (
    !PLACEHOLDER_VALUES.has(lower) &&
    !lower.startsWith('your_') &&
    !lower.startsWith('your-') &&
    !lower.includes('placeholder') &&
    !lower.includes('<') &&
    !lower.includes('>')
  );
}

export function isPolarWorkspaceSetupEnabled(
  env: PolarWorkspaceSetupEnv = process.env,
  { devMode = DEV_MODE }: { devMode?: boolean } = {}
) {
  const hasRequiredCredentials =
    hasUsablePolarCredential(env.POLAR_ACCESS_TOKEN) &&
    hasUsablePolarCredential(env.POLAR_WEBHOOK_SECRET);

  if (!hasRequiredCredentials) return false;

  const explicitSetupFlag = parseBooleanEnv(env.POLAR_WORKSPACE_SETUP_ENABLED);
  if (explicitSetupFlag !== null) return explicitSetupFlag;

  if (devMode) {
    return parseBooleanEnv(env.POLAR_ENABLE_LOCAL_WORKSPACE_SETUP) === true;
  }

  return true;
}
