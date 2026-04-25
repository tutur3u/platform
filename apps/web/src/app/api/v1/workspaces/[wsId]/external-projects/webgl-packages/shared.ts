import 'server-only';

import { posix } from 'node:path';
import { ENABLE_CMS_GAMES_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceExternalProjectBinding } from '@tuturuuu/types';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { getSecrets } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceConfig } from '@/lib/workspace-helper';
import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
} from '@/lib/workspace-storage-config';

export type WebglPackageEntryContext = {
  collectionSlug: string;
  collectionType: string;
  entrySlug: string;
};

function resolveConfiguredOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const [firstValue] = value
      .split(/[,\n]/u)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!firstValue) {
      return null;
    }

    const normalized = /^[a-z]+:\/\//iu.test(firstValue)
      ? firstValue
      : `https://${firstValue}`;

    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function createSecretsMap(
  secrets: Awaited<ReturnType<typeof getSecrets>> | null
) {
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

export function resolveWebglCallbackOrigin(requestOrigin: string) {
  return (
    resolveConfiguredOrigin(process.env.INTERNAL_WEB_API_ORIGIN) ||
    resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    resolveConfiguredOrigin(process.env.COOLIFY_URL) ||
    resolveConfiguredOrigin(process.env.COOLIFY_FQDN) ||
    requestOrigin ||
    'https://tuturuuu.com'
  );
}

export async function resolveWebglPackageExtractConfig(wsId: string) {
  const secrets = await getSecrets({ forceAdmin: true, wsId });
  const secretMap = createSecretsMap(secrets);
  const proxyUrl =
    secretMap.get(DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET)?.trim() ||
    process.env.DRIVE_AUTO_EXTRACT_PROXY_URL?.trim();
  const proxyToken =
    secretMap.get(DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET)?.trim() ||
    process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN?.trim();

  return {
    configured: Boolean(proxyUrl && proxyToken),
    proxyToken,
    proxyUrl,
  };
}

export async function isCmsGamesEnabled(wsId: string) {
  const value = await getWorkspaceConfig(wsId, ENABLE_CMS_GAMES_CONFIG_ID);
  return value?.trim().toLowerCase() === 'true';
}

export async function getWebglPackageEntryContext(
  admin: TypedSupabaseClient,
  wsId: string,
  entryId: string
): Promise<WebglPackageEntryContext | null> {
  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .select(
      'id, slug, workspace_external_project_collections!inner(slug, collection_type)'
    )
    .eq('id', entryId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const collection = Array.isArray(data.workspace_external_project_collections)
    ? data.workspace_external_project_collections[0]
    : data.workspace_external_project_collections;

  if (!collection?.slug || !collection.collection_type || !data.slug) {
    return null;
  }

  return {
    collectionSlug: collection.slug,
    collectionType: collection.collection_type,
    entrySlug: data.slug,
  };
}

export function buildWebglPackageUploadPath(input: {
  binding: WorkspaceExternalProjectBinding;
  entry: WebglPackageEntryContext;
}) {
  const adapter = sanitizePath(input.binding.adapter || 'shared') || 'shared';
  const collection =
    sanitizePath(input.entry.collectionSlug || input.entry.collectionType) ||
    'collection';
  const entrySlug = sanitizePath(input.entry.entrySlug) || 'entry';

  return posix.join(
    'external-projects',
    adapter,
    collection,
    entrySlug,
    'webgl-packages'
  );
}

export function sanitizeWebglZipFilename(filename: string) {
  return sanitizeFilename(filename) || null;
}
