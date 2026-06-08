import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

export type DevboxSetupTool = 'bun' | 'docker' | 'git' | 'node';
export type DevboxSetupPackageManager =
  | 'apt-get'
  | 'brew'
  | 'dnf'
  | 'pacman'
  | 'winget';

export const DEFAULT_DEVBOX_CHECKOUT_DIRNAME = 'tuturuuu';
export const DEFAULT_DEVBOX_REPOSITORY_URL =
  'https://github.com/tutur3u/platform.git';
export const DEVBOX_SUPABASE_ENV_KEY_ORDER = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
  'DOCKER_INTERNAL_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

export type DevboxSupabaseEnvKey =
  (typeof DEVBOX_SUPABASE_ENV_KEY_ORDER)[number];

export type DevboxSupabaseEnv = Partial<Record<DevboxSupabaseEnvKey, string>>;

export interface LocalSupabaseStatus {
  anonKey: string;
  apiUrl: string;
  dbUrl?: string;
  serviceRoleKey: string;
  studioUrl?: string;
}

export interface DevboxSetupPlanInput {
  missingTools: DevboxSetupTool[];
  packageManager: DevboxSetupPackageManager;
  platform: NodeJS.Platform;
}

export interface DefaultDevboxCheckoutPathOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
}

const PACKAGE_COMMANDS: Record<
  DevboxSetupPackageManager,
  Partial<Record<DevboxSetupTool, string[]>>
> = {
  'apt-get': {
    bun: ['bash', '-lc', 'curl -fsSL https://bun.sh/install | bash'],
    docker: ['sudo', 'apt-get', 'install', '-y', 'docker.io'],
    git: ['sudo', 'apt-get', 'install', '-y', 'git'],
    node: ['sudo', 'apt-get', 'install', '-y', 'nodejs'],
  },
  brew: {
    bun: ['brew', 'install', 'bun'],
    docker: ['brew', 'install', '--cask', 'docker'],
    git: ['brew', 'install', 'git'],
    node: ['brew', 'install', 'node'],
  },
  dnf: {
    bun: ['bash', '-lc', 'curl -fsSL https://bun.sh/install | bash'],
    docker: ['sudo', 'dnf', 'install', '-y', 'docker'],
    git: ['sudo', 'dnf', 'install', '-y', 'git'],
    node: ['sudo', 'dnf', 'install', '-y', 'nodejs'],
  },
  pacman: {
    bun: ['sudo', 'pacman', '-S', '--noconfirm', 'bun'],
    docker: ['sudo', 'pacman', '-S', '--noconfirm', 'docker'],
    git: ['sudo', 'pacman', '-S', '--noconfirm', 'git'],
    node: ['sudo', 'pacman', '-S', '--noconfirm', 'nodejs'],
  },
  winget: {
    bun: ['winget', 'install', 'Oven-sh.Bun'],
    docker: ['winget', 'install', 'Docker.DockerDesktop'],
    git: ['winget', 'install', 'Git.Git'],
    node: ['winget', 'install', 'OpenJS.NodeJS.LTS'],
  },
};

export function createDevboxSetupPlan(input: DevboxSetupPlanInput) {
  const commands = input.missingTools.flatMap((tool) => {
    const command = PACKAGE_COMMANDS[input.packageManager][tool];
    return command ? [command] : [];
  });

  return {
    commands,
    missingTools: input.missingTools,
    packageManager: input.packageManager,
    platform: input.platform,
  };
}

export function getDefaultDevboxCheckoutPath(
  options: DefaultDevboxCheckoutPathOptions = {}
) {
  const home = options.homeDir ?? homedir();
  const currentPlatform = options.platform ?? process.platform;
  const pathModule = currentPlatform === 'win32' ? win32 : posix;

  return pathModule.join(home, 'Documents', DEFAULT_DEVBOX_CHECKOUT_DIRNAME);
}

function normalizeRepositoryPath(pathname: string) {
  return pathname
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '')
    .replace(/\.git$/iu, '')
    .toLowerCase();
}

export function isTuturuuuPlatformRepositoryUrl(value: string | null) {
  const remote = value?.trim();
  if (!remote) return false;

  const sshMatch = remote.match(
    /^(?:ssh:\/\/)?git@github\.com[:/]tutur3u\/platform(?:\.git)?$/iu
  );
  if (sshMatch) return true;

  try {
    const url = new URL(remote.replace(/^git\+/iu, ''));
    return (
      url.hostname.toLowerCase() === 'github.com' &&
      normalizeRepositoryPath(url.pathname) === 'tutur3u/platform'
    );
  } catch {
    return false;
  }
}

function normalizeStatusKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/giu, '');
}

function getStatusValue(
  status: Record<string, unknown>,
  ...candidates: string[]
) {
  const candidateSet = new Set(candidates.map(normalizeStatusKey));

  for (const [key, value] of Object.entries(status)) {
    if (!candidateSet.has(normalizeStatusKey(key))) continue;
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

function normalizeHttpOrigin(name: string, value: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid local Supabase ${name}: ${value}`);
  }
}

export function parseLocalSupabaseStatus(
  input: string | Record<string, unknown>
): LocalSupabaseStatus {
  const status =
    typeof input === 'string'
      ? (JSON.parse(input) as Record<string, unknown>)
      : input;
  const apiUrlRaw = getStatusValue(
    status,
    'API URL',
    'API_URL',
    'api_url',
    'apiUrl',
    'SUPABASE_URL',
    'supabase_url'
  );
  const anonKey = getStatusValue(
    status,
    'anon key',
    'anon_key',
    'ANON_KEY',
    'SUPABASE_ANON_KEY',
    'publishable key',
    'publishable_key',
    'PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  );
  const serviceRoleKey = getStatusValue(
    status,
    'service_role key',
    'service_role_key',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  );

  if (!apiUrlRaw || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Could not resolve local Supabase API URL, anon/publishable key, and service role key from `supabase status`.'
    );
  }

  const dbUrl = getStatusValue(
    status,
    'DB URL',
    'DB_URL',
    'db_url',
    'database_url',
    'DATABASE_URL'
  );
  const studioUrl = getStatusValue(
    status,
    'Studio URL',
    'STUDIO_URL',
    'studio_url',
    'studioUrl'
  );

  return {
    anonKey,
    apiUrl: normalizeHttpOrigin('API URL', apiUrlRaw),
    ...(dbUrl ? { dbUrl } : {}),
    serviceRoleKey,
    ...(studioUrl
      ? { studioUrl: normalizeHttpOrigin('Studio URL', studioUrl) }
      : {}),
  };
}

function createDockerInternalUrl(apiUrl: string) {
  const url = new URL(apiUrl);
  url.hostname = 'host.docker.internal';
  return url.origin;
}

export function createLocalSupabaseEnv(
  status: LocalSupabaseStatus
): Required<DevboxSupabaseEnv> {
  return {
    DOCKER_INTERNAL_SUPABASE_URL: createDockerInternalUrl(status.apiUrl),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: status.apiUrl,
    SUPABASE_SECRET_KEY: status.serviceRoleKey,
    SUPABASE_SERVER_URL: status.apiUrl,
    SUPABASE_URL: status.apiUrl,
  };
}

export function redactDevboxSupabaseEnv(env: DevboxSupabaseEnv) {
  return Object.fromEntries(
    DEVBOX_SUPABASE_ENV_KEY_ORDER.filter((key) => env[key]).map((key) => [
      key,
      '[REDACTED]',
    ])
  ) as DevboxSupabaseEnv;
}

function hasEnvKey(content: string, key: DevboxSupabaseEnvKey) {
  return new RegExp(`(^|\\n)\\s*${key}=`, 'u').test(content);
}

export function getDevboxSupabaseEnvKeysForApp({
  envLocalContent = '',
  exampleContent = '',
}: {
  envLocalContent?: string;
  exampleContent?: string;
}) {
  const content = `${exampleContent}\n${envLocalContent}`;
  const keys = new Set<DevboxSupabaseEnvKey>();
  const hasPublicSupabase =
    hasEnvKey(content, 'NEXT_PUBLIC_SUPABASE_URL') ||
    hasEnvKey(content, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  if (hasPublicSupabase) {
    keys.add('NEXT_PUBLIC_SUPABASE_URL');
    keys.add('SUPABASE_SERVER_URL');
    keys.add('SUPABASE_URL');
    keys.add('DOCKER_INTERNAL_SUPABASE_URL');
    keys.add('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  for (const key of DEVBOX_SUPABASE_ENV_KEY_ORDER) {
    if (hasEnvKey(content, key)) keys.add(key);
  }

  return DEVBOX_SUPABASE_ENV_KEY_ORDER.filter((key) => keys.has(key));
}

function formatEnvValue(value: string) {
  if (/[\r\n]/u.test(value)) {
    throw new Error('Environment values cannot contain newlines.');
  }

  return value;
}

export function upsertDevboxEnvContent({
  content,
  env,
  keys,
}: {
  content: string;
  env: DevboxSupabaseEnv;
  keys: DevboxSupabaseEnvKey[];
}) {
  const pending = new Set(keys.filter((key) => env[key]));
  const lines = content
    ? content.replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n')
    : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    const key = match?.[1] as DevboxSupabaseEnvKey | undefined;

    if (!key || !pending.has(key)) return line;
    pending.delete(key);
    return `${key}=${formatEnvValue(env[key] ?? '')}`;
  });

  for (const key of keys) {
    if (pending.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(env[key] ?? '')}`);
    }
  }

  return `${nextLines.join('\n')}\n`;
}
