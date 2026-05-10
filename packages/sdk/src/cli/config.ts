import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, posix, win32 } from 'node:path';

export interface CliSession {
  accessToken: string;
  expiresAt?: number | null;
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

export function normalizeBaseUrl(value?: string) {
  if (!value?.trim()) {
    return DEFAULT_BASE_URL;
  }

  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return normalizeBrowserSafeOrigin(new URL(withProtocol).origin);
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
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
      currentBoardId: parsed.currentBoardId,
      currentLabelId: parsed.currentLabelId,
      currentListId: parsed.currentListId,
      currentProjectId: parsed.currentProjectId,
      currentTaskId: parsed.currentTaskId,
      currentWorkspaceId: parsed.currentWorkspaceId,
      session: parsed.session,
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
        baseUrl: normalizeBaseUrl(config.baseUrl),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
}
