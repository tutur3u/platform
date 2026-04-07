import 'server-only';

import { posix } from 'node:path';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getSecrets } from '@tuturuuu/utils/workspace-helper';
import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
  DRIVE_AUTO_EXTRACT_ZIP_SECRET,
} from './workspace-storage-config';
import { createWorkspaceStorageSignedReadUrl } from './workspace-storage-provider';

type AutoExtractStatus =
  | 'completed'
  | 'disabled'
  | 'error'
  | 'misconfigured'
  | 'skipped';

export interface WorkspaceStorageAutoExtractConfig {
  enabled: boolean;
  configured: boolean;
  proxyUrl?: string;
  proxyToken?: string;
}

export interface WorkspaceStorageAutoExtractResult {
  status: AutoExtractStatus;
  message: string;
  archivePath: string;
  destinationPrefix?: string;
  files?: number;
  folders?: number;
}

function resolveConfiguredOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveAutoExtractCallbackOrigin(requestOrigin: string) {
  return (
    resolveConfiguredOrigin(process.env.INTERNAL_WEB_API_ORIGIN) ||
    resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    (DEV_MODE ? 'http://localhost:7803' : 'https://tuturuuu.com') ||
    requestOrigin
  );
}

function createSecretsMap(
  secrets: Awaited<ReturnType<typeof getSecrets>> | null
): Map<string, string> {
  const map = new Map<string, string>();

  for (const secret of secrets ?? []) {
    if (
      !secret.name ||
      typeof secret.value !== 'string' ||
      map.has(secret.name)
    ) {
      continue;
    }

    map.set(secret.name, secret.value);
  }

  return map;
}

function isTruthySecret(value?: string) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function isZipUpload(
  path: string,
  contentType?: string,
  originalFilename?: string
) {
  const lowerPath = path.toLowerCase();
  const lowerFilename = (originalFilename ?? '').toLowerCase();
  const lowerType = (contentType ?? '').toLowerCase();

  return (
    lowerPath.endsWith('.zip') ||
    lowerFilename.endsWith('.zip') ||
    lowerType === 'application/zip' ||
    lowerType === 'application/x-zip-compressed'
  );
}

function buildDestinationPrefix(path: string) {
  const dir = posix.dirname(path);
  const archiveName = posix.basename(path, posix.extname(path));

  if (!archiveName) {
    return '';
  }

  return dir === '.' ? archiveName : posix.join(dir, archiveName);
}

export async function resolveWorkspaceStorageAutoExtractConfig(
  wsId: string
): Promise<WorkspaceStorageAutoExtractConfig> {
  const secrets = await getSecrets({ wsId, forceAdmin: true });
  const secretMap = createSecretsMap(secrets);
  const enabled = isTruthySecret(secretMap.get(DRIVE_AUTO_EXTRACT_ZIP_SECRET));
  const proxyUrl = secretMap.get(DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET)?.trim();
  const proxyToken = secretMap
    .get(DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET)
    ?.trim();

  return {
    enabled,
    configured: enabled ? !!proxyUrl && !!proxyToken : false,
    proxyUrl,
    proxyToken,
  };
}

export async function triggerWorkspaceStorageAutoExtract(
  wsId: string,
  options: {
    path: string;
    contentType?: string;
    originalFilename?: string;
    requestOrigin: string;
  }
): Promise<WorkspaceStorageAutoExtractResult> {
  if (
    !isZipUpload(options.path, options.contentType, options.originalFilename)
  ) {
    return {
      status: 'skipped',
      message: 'Uploaded file is not a ZIP archive.',
      archivePath: options.path,
    };
  }

  const config = await resolveWorkspaceStorageAutoExtractConfig(wsId);

  if (!config.enabled) {
    return {
      status: 'disabled',
      message: 'ZIP auto extraction is disabled for this workspace.',
      archivePath: options.path,
    };
  }

  if (!config.configured || !config.proxyUrl || !config.proxyToken) {
    return {
      status: 'misconfigured',
      message:
        'ZIP auto extraction is enabled, but the proxy secrets are incomplete.',
      archivePath: options.path,
    };
  }

  const destinationPrefix = buildDestinationPrefix(options.path);

  try {
    const sourceUrl = await createWorkspaceStorageSignedReadUrl(
      wsId,
      options.path,
      {
        expiresIn: 900,
      }
    );
    const callbackOrigin = resolveAutoExtractCallbackOrigin(
      options.requestOrigin
    );
    const callbackUrl = new URL(
      `/api/v1/workspaces/${encodeURIComponent(wsId)}/storage/auto-extract`,
      callbackOrigin
    ).toString();
    const response = await fetch(config.proxyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.proxyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceUrl,
        callbackToken: config.proxyToken,
        callbackUrl,
        destinationPrefix,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');

      return {
        status: 'error',
        message:
          message ||
          `ZIP auto extraction proxy failed with status ${response.status}.`,
        archivePath: options.path,
        destinationPrefix,
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      files?: number;
      folders?: number;
      message?: string;
    } | null;

    return {
      status: 'completed',
      message:
        payload?.message || 'ZIP archive uploaded and extracted successfully.',
      archivePath: options.path,
      destinationPrefix,
      files: payload?.files ?? 0,
      folders: payload?.folders ?? 0,
    };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'ZIP auto extraction failed unexpectedly.',
      archivePath: options.path,
      destinationPrefix,
    };
  }
}
