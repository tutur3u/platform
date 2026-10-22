import type { CliConfig } from './config';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const NPM_LATEST_URL = 'https://registry.npmjs.org/tuturuuu/latest';

type StderrLike = Pick<NodeJS.WriteStream, 'write'>;

interface NpmLatestPayload {
  version?: string;
}

function parseVersion(version: string) {
  const [core] = version.split('-', 1);
  const parts = (core || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as const;
}

export function compareVersions(nextVersion: string, currentVersion: string) {
  const next = parseVersion(nextVersion);
  const current = parseVersion(currentVersion);

  if (!next || !current) {
    return 0;
  }

  for (let i = 0; i < 3; i++) {
    const diff = (next[i] ?? 0) - (current[i] ?? 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }

  return 0;
}

export function shouldCheckForUpdate({
  checkedAt,
  now = new Date(),
}: {
  checkedAt?: string;
  now?: Date;
}) {
  if (!checkedAt) {
    return true;
  }

  const checkedAtTime = new Date(checkedAt).getTime();
  if (!Number.isFinite(checkedAtTime)) {
    return true;
  }

  return now.getTime() - checkedAtTime >= UPDATE_CHECK_INTERVAL_MS;
}

export function isCliUpdateCheckDisabled(
  env: Record<string, string | undefined> = process.env
) {
  const value = env.TUTURUUU_DISABLE_UPDATE_CHECK?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export async function checkForCliUpdate({
  config,
  currentVersion,
  fetch = globalThis.fetch,
  now = new Date(),
  stderr = process.stderr,
  quiet = false,
}: {
  config: CliConfig;
  currentVersion: string;
  fetch?: typeof globalThis.fetch;
  now?: Date;
  stderr?: StderrLike;
  quiet?: boolean;
}): Promise<CliConfig> {
  const checkedAt = now.toISOString();

  if (
    !shouldCheckForUpdate({
      checkedAt: config.updateCheck?.checkedAt,
      now,
    })
  ) {
    return config;
  }

  try {
    const response = await fetch(NPM_LATEST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `tuturuuu-cli/${currentVersion}`,
      },
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return {
        ...config,
        updateCheck: {
          checkedAt,
          latestVersion: config.updateCheck?.latestVersion,
        },
      };
    }

    const payload = (await response.json()) as NpmLatestPayload;
    const latestVersion = payload.version;

    if (
      !quiet &&
      latestVersion &&
      compareVersions(latestVersion, currentVersion) > 0
    ) {
      stderr.write(
        [
          `A new Tuturuuu CLI version is available: ${currentVersion} -> ${latestVersion}`,
          'Update with: ttr upgrade',
          '',
        ].join('\n')
      );
    }

    return {
      ...config,
      updateCheck: {
        checkedAt,
        latestVersion,
      },
    };
  } catch {
    return {
      ...config,
      updateCheck: {
        checkedAt,
        latestVersion: config.updateCheck?.latestVersion,
      },
    };
  }
}
