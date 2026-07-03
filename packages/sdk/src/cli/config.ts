import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, posix, win32 } from 'node:path';

export interface CliSession {
  accessToken: string;
  expiresAt?: number | null;
  refreshExpiresAt?: number | null;
  refreshToken: string;
  tokenType?: string;
}

export interface CliConfig {
  baseUrl: string;
  currentBoardId?: string;
  currentLabelId?: string;
  currentListId?: string;
  currentProjectId?: string;
  currentTaskId?: string;
  currentWorkspaceId?: string;
  session?: CliSession;
  tasksBaseUrl?: string;
  updateCheck?: {
    checkedAt: string;
    latestVersion?: string;
  };
}

export interface ConfigPathOptions {
  env: Record<string, string | undefined>;
  homeDir: string;
  platform: NodeJS.Platform;
}

export const DEFAULT_BASE_URL = 'https://tuturuuu.com';
export const DEFAULT_TASKS_BASE_URL = 'https://tasks.tuturuuu.com';
export const PORTLESS_LOCAL_BASE_URL = 'https://tuturuuu.localhost';
export const PORTLESS_LOCAL_TASKS_BASE_URL = 'https://tasks.tuturuuu.localhost';
export const LOCAL_BASE_URL_ENV_KEYS = [
  'TUTURUUU_LOCAL_BASE_URL',
  'PORTLESS_URL',
  'WEB_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;
export const TASKS_BASE_URL_ENV_KEYS = [
  'TUTURUUU_TASKS_BASE_URL',
  'TASKS_APP_URL',
  'NEXT_PUBLIC_TASKS_APP_URL',
  'TUDO_APP_URL',
  'NEXT_PUBLIC_TUDO_APP_URL',
] as const;

export interface NormalizeBaseUrlOptions {
  inferLocalhostProtocol?: boolean;
}

export interface ResolveHostOptions {
  env?: Record<string, string | undefined>;
  port?: string;
  portless?: boolean;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/u, '');
}

function normalizeBrowserSafeOrigin(origin: string) {
  const url = new URL(origin);

  if (
    url.hostname === '0.0.0.0' ||
    url.hostname === '::' ||
    url.hostname === '[::]'
  ) {
    url.hostname = 'localhost';
  }

  return stripTrailingSlash(url.origin);
}

function isBareLocalhost(value: string) {
  return /^(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?$/iu.test(value);
}

function inferProtocol(value: string, options: NormalizeBaseUrlOptions) {
  return options.inferLocalhostProtocol && isBareLocalhost(value)
    ? 'http'
    : 'https';
}

export function normalizeBaseUrl(
  value?: string,
  options: NormalizeBaseUrlOptions = {}
) {
  if (!value?.trim()) {
    return DEFAULT_BASE_URL;
  }

  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `${inferProtocol(trimmed, options)}://${trimmed}`;

  return normalizeBrowserSafeOrigin(new URL(withProtocol).origin);
}

export function normalizeHostBaseUrl(value?: string) {
  return normalizeBaseUrl(value, { inferLocalhostProtocol: true });
}

function isSafeLocalHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

export function isSafeLocalBaseUrl(value?: string) {
  if (!value?.trim()) return false;

  try {
    const url = new URL(normalizeHostBaseUrl(value));
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isSafeLocalHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export function getEnvLocalBaseUrl(
  env: Record<string, string | undefined> = process.env
) {
  for (const key of LOCAL_BASE_URL_ENV_KEYS) {
    const value = env[key];
    if (isSafeLocalBaseUrl(value)) {
      return normalizeHostBaseUrl(value);
    }
  }
}

export function getEnvTasksBaseUrl(
  env: Record<string, string | undefined> = process.env
) {
  for (const key of TASKS_BASE_URL_ENV_KEYS) {
    const value = env[key];
    if (value?.trim()) {
      return normalizeHostBaseUrl(value);
    }
  }
}

export function resolveCliTasksBaseUrl(
  platformBaseUrl?: string,
  env: Record<string, string | undefined> = process.env
) {
  const configuredTasksBaseUrl = getEnvTasksBaseUrl(env);
  if (configuredTasksBaseUrl) return configuredTasksBaseUrl;

  const baseUrl = normalizeHostBaseUrl(platformBaseUrl);
  const url = new URL(baseUrl);

  if (url.hostname === 'tuturuuu.com') {
    return DEFAULT_TASKS_BASE_URL;
  }

  if (url.hostname === 'tuturuuu.localhost') {
    return PORTLESS_LOCAL_TASKS_BASE_URL;
  }

  if (
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname) &&
    url.port === '7803'
  ) {
    url.port = '7809';
    return stripTrailingSlash(url.origin);
  }

  return DEFAULT_TASKS_BASE_URL;
}

function normalizePort(value?: string) {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return String(parsed);
}

function withPort(baseUrl: string, port?: string) {
  const normalizedPort = normalizePort(port);
  if (!normalizedPort) return baseUrl;

  const url = new URL(baseUrl);
  url.port = normalizedPort;
  return stripTrailingSlash(url.origin);
}

export function resolveCliHostBaseUrl(
  target?: string,
  options: ResolveHostOptions = {}
) {
  const normalizedTarget = target?.trim().toLowerCase();

  if (
    normalizedTarget === 'production' ||
    normalizedTarget === 'prod' ||
    normalizedTarget === undefined ||
    normalizedTarget === ''
  ) {
    if (options.port || options.portless) {
      throw new Error('Ports are only supported for local host targets.');
    }
    return DEFAULT_BASE_URL;
  }

  if (normalizedTarget === 'local' || normalizedTarget === 'localhost') {
    const baseUrl = options.port
      ? options.portless
        ? PORTLESS_LOCAL_BASE_URL
        : 'http://localhost'
      : getEnvLocalBaseUrl(options.env) || PORTLESS_LOCAL_BASE_URL;
    return withPort(baseUrl, options.port);
  }

  if (options.port || options.portless) {
    throw new Error('Ports are only supported for local host targets.');
  }

  return normalizeHostBaseUrl(target);
}

export function clearHostScopedConfig(
  config: CliConfig,
  nextBaseUrl: string
): CliConfig {
  const currentBaseUrl = normalizeHostBaseUrl(config.baseUrl);
  const normalizedNextBaseUrl = normalizeHostBaseUrl(nextBaseUrl);

  if (currentBaseUrl === normalizedNextBaseUrl) {
    return {
      ...config,
      baseUrl: normalizedNextBaseUrl,
    };
  }

  return {
    baseUrl: normalizedNextBaseUrl,
    tasksBaseUrl: resolveCliTasksBaseUrl(normalizedNextBaseUrl),
    updateCheck: config.updateCheck,
  };
}

export function getDefaultConfigPath(
  options: ConfigPathOptions = {
    env: process.env,
    homeDir: homedir(),
    platform: platform(),
  }
) {
  if (options.env.TUTURUUU_CONFIG?.trim()) {
    return options.env.TUTURUUU_CONFIG;
  }

  if (options.platform === 'win32') {
    const appData =
      options.env.APPDATA || win32.join(options.homeDir, 'AppData', 'Roaming');
    return win32.join(appData, 'Tuturuuu', 'config.json');
  }

  if (options.platform === 'darwin') {
    return posix.join(
      options.homeDir,
      'Library',
      'Application Support',
      'Tuturuuu',
      'config.json'
    );
  }

  const configHome =
    options.env.XDG_CONFIG_HOME || posix.join(options.homeDir, '.config');
  return posix.join(configHome, 'tuturuuu', 'config.json');
}

export async function readCliConfig(
  path = getDefaultConfigPath()
): Promise<CliConfig> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      baseUrl: normalizeHostBaseUrl(parsed.baseUrl),
      currentBoardId: parsed.currentBoardId,
      currentLabelId: parsed.currentLabelId,
      currentListId: parsed.currentListId,
      currentProjectId: parsed.currentProjectId,
      currentTaskId: parsed.currentTaskId,
      currentWorkspaceId: parsed.currentWorkspaceId,
      session: parsed.session,
      tasksBaseUrl: parsed.tasksBaseUrl
        ? normalizeHostBaseUrl(parsed.tasksBaseUrl)
        : undefined,
      updateCheck: parsed.updateCheck,
    } satisfies CliConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { baseUrl: DEFAULT_BASE_URL } satisfies CliConfig;
    }

    throw error;
  }
}

export async function writeCliConfig(
  config: CliConfig,
  path = getDefaultConfigPath()
) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        ...config,
        baseUrl: normalizeHostBaseUrl(config.baseUrl),
        tasksBaseUrl: config.tasksBaseUrl
          ? normalizeHostBaseUrl(config.tasksBaseUrl)
          : undefined,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
}
