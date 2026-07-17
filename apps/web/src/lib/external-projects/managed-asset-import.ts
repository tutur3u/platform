import { createHash } from 'node:crypto';
import { uploadWorkspaceStorageFileDirect } from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExternalProjectImportJob, Json } from '@tuturuuu/types';
import { fetch as undiciFetch } from 'undici';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import {
  closeManagedAssetDispatcher,
  createManagedAssetPinnedDispatcher,
  resolveSafeManagedAssetAddress,
} from './managed-asset-url-policy';

type AdminDb = TypedSupabaseClient;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const IMPORT_TIMEOUT_MS = 15_000;
const IMPORT_BATCH_SIZE = 5;
const IMPORT_CONCURRENCY = 3;

type ImportFailure = { assetId: string; message: string };
type ManagedAssetImportReport = {
  assetIds: string[];
  failures: ImportFailure[];
  processedAssetIds: string[];
  total: number;
};

export class ManagedAssetImportValidationError extends Error {}

function isAllowedContentType(value: string) {
  const type = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    /^(image|audio|video)\//.test(type) ||
    ['application/octet-stream', 'application/pdf', 'application/zip'].includes(
      type
    )
  );
}

async function fetchManagedAsset(sourceUrl: string) {
  let current = new URL(sourceUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const address = await resolveSafeManagedAssetAddress(current);
    const dispatcher = createManagedAssetPinnedDispatcher(address);

    try {
      const response = await undiciFetch(current, {
        dispatcher,
        headers: { Accept: 'image/*,audio/*,video/*,application/octet-stream' },
        redirect: 'manual',
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) {
          throw new Error('Asset source exceeded the redirect limit');
        }
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Asset source returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!isAllowedContentType(contentType)) {
        throw new Error(
          `Unsupported asset content type: ${contentType || 'unknown'}`
        );
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
        throw new Error('Asset exceeds the 25 MiB import limit');
      }

      const buffer = await readLimitedAssetBody(response);
      return {
        buffer,
        contentType: contentType.split(';')[0] ?? contentType,
        finalUrl: current,
      };
    } finally {
      await closeManagedAssetDispatcher(dispatcher);
    }
  }

  throw new Error('Asset source exceeded the redirect limit');
}

async function readLimitedAssetBody(
  response: Awaited<ReturnType<typeof undiciFetch>>
) {
  if (!response.body) throw new Error('Asset source returned an empty body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) {
      await reader.cancel().catch(() => null);
      throw new Error('Asset exceeds the 25 MiB import limit');
    }
    chunks.push(value);
  }

  if (total === 0) throw new Error('Asset source returned an empty body');
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function safePathSegment(value: string, fallback: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || fallback
  );
}

function sourceFilename(url: URL, contentType: string) {
  const candidate = decodeURIComponent(
    url.pathname.split('/').pop() ?? 'asset'
  );
  const safe = safePathSegment(candidate, 'asset');
  if (safe.includes('.')) return safe;
  const extension =
    contentType.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
  return `${safe}.${extension}`;
}

function parseReport(value: Json): ManagedAssetImportReport {
  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const strings = (item: unknown) =>
    Array.isArray(item)
      ? item.filter((value): value is string => typeof value === 'string')
      : [];
  const failures = Array.isArray(record.failures)
    ? record.failures.filter(
        (failure): failure is ImportFailure =>
          !!failure &&
          typeof failure === 'object' &&
          typeof (failure as ImportFailure).assetId === 'string' &&
          typeof (failure as ImportFailure).message === 'string'
      )
    : [];
  const assetIds = strings(record.assetIds);
  return {
    assetIds,
    failures,
    processedAssetIds: strings(record.processedAssetIds),
    total: assetIds.length,
  };
}

export async function createManagedAssetImportJob(
  payload: {
    actorId: string;
    adapter: ExternalProjectImportJob['adapter'];
    assetIds: string[];
    canonicalProjectId: string;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const assetIds = [...new Set(payload.assetIds)];
  const { data: assets, error: assetError } = await admin
    .from('workspace_external_project_assets')
    .select('id')
    .eq('ws_id', payload.workspaceId)
    .in('id', assetIds)
    .not('source_url', 'is', null);
  if (assetError) throw new Error(assetError.message);
  if ((assets ?? []).length !== assetIds.length) {
    throw new ManagedAssetImportValidationError(
      'Every selected asset must be an external asset in this workspace'
    );
  }

  const report: ManagedAssetImportReport = {
    assetIds,
    failures: [],
    processedAssetIds: [],
    total: assetIds.length,
  };
  const { data, error } = await admin
    .from('workspace_external_project_import_jobs')
    .insert({
      adapter: payload.adapter,
      canonical_external_project_id: payload.canonicalProjectId,
      report: report as unknown as Json,
      requested_by: payload.actorId,
      source_reference: 'managed-assets',
      status: 'queued',
      ws_id: payload.workspaceId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function importAsset(
  admin: AdminDb,
  workspaceId: string,
  adapter: string,
  assetId: string
) {
  const { data: asset, error } = await admin
    .from('workspace_external_project_assets')
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('id', assetId)
    .single();
  if (error || !asset?.source_url || !asset.entry_id) {
    throw new Error(
      error?.message ?? 'External asset or owning entry is missing'
    );
  }
  const { data: entry, error: entryError } = await admin
    .from('workspace_external_project_entries')
    .select('id, slug, collection_id')
    .eq('ws_id', workspaceId)
    .eq('id', asset.entry_id)
    .single();
  if (entryError) throw new Error(entryError.message);
  const { data: collection, error: collectionError } = await admin
    .from('workspace_external_project_collections')
    .select('slug')
    .eq('ws_id', workspaceId)
    .eq('id', entry.collection_id)
    .single();
  if (collectionError) throw new Error(collectionError.message);

  const sourceUrl = asset.source_url;
  const downloaded = await fetchManagedAsset(sourceUrl);
  const checksum = createHash('sha256').update(downloaded.buffer).digest('hex');
  const filename = sourceFilename(downloaded.finalUrl, downloaded.contentType);
  const path = [
    'external-projects',
    safePathSegment(adapter, 'external'),
    safePathSegment(collection.slug, 'collection'),
    safePathSegment(entry.slug, entry.id),
    `${checksum}-${filename}`,
  ].join('/');

  await uploadWorkspaceStorageFileDirect(workspaceId, path, downloaded.buffer, {
    contentType: downloaded.contentType,
    upsert: true,
  });
  const metadata =
    asset.metadata &&
    typeof asset.metadata === 'object' &&
    !Array.isArray(asset.metadata)
      ? { ...asset.metadata }
      : {};
  metadata.import = {
    checksumSha256: checksum,
    finalSourceUrl: downloaded.finalUrl.toString(),
    importedAt: new Date().toISOString(),
    sourceUrl,
  };
  const { error: updateError } = await admin
    .from('workspace_external_project_assets')
    .update({ metadata, source_url: null, storage_path: path })
    .eq('ws_id', workspaceId)
    .eq('id', assetId);
  if (updateError) throw new Error(updateError.message);
}

export async function processManagedAssetImportJob(
  workspaceId: string,
  jobId: string,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data: job, error } = await admin
    .from('workspace_external_project_import_jobs')
    .update({
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .eq('ws_id', workspaceId)
    .eq('id', jobId)
    .eq('source_reference', 'managed-assets')
    .in('status', ['queued', 'failed'])
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) {
    const current = await getManagedAssetImportJob(workspaceId, jobId, admin);
    if (!current) throw new Error('Managed asset import job not found');
    return current;
  }

  const report = parseReport(job.report);
  const processed = new Set(report.processedAssetIds);
  const pending = report.assetIds
    .filter((id) => !processed.has(id))
    .slice(0, IMPORT_BATCH_SIZE);
  const failures: ImportFailure[] = [];
  for (let index = 0; index < pending.length; index += IMPORT_CONCURRENCY) {
    await Promise.all(
      pending.slice(index, index + IMPORT_CONCURRENCY).map(async (assetId) => {
        try {
          await importAsset(admin, workspaceId, job.adapter, assetId);
          processed.add(assetId);
        } catch (importError) {
          failures.push({
            assetId,
            message:
              importError instanceof Error
                ? importError.message
                : String(importError),
          });
        }
      })
    );
  }

  const nextReport: ManagedAssetImportReport = {
    ...report,
    failures,
    processedAssetIds: [...processed],
  };
  const completed = processed.size === report.assetIds.length;
  const status = completed
    ? 'completed'
    : failures.length > 0
      ? 'failed'
      : 'queued';
  const { data: updated, error: updateError } = await admin
    .from('workspace_external_project_import_jobs')
    .update({
      completed_at: completed ? new Date().toISOString() : null,
      report: nextReport as unknown as Json,
      status,
    })
    .eq('ws_id', workspaceId)
    .eq('id', job.id)
    .select('*')
    .single();
  if (updateError) throw new Error(updateError.message);

  await invalidateWorkspaceExternalProjectCache(workspaceId, pending);
  return updated;
}

export async function getManagedAssetImportJob(
  workspaceId: string,
  jobId: string,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await admin
    .from('workspace_external_project_import_jobs')
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('id', jobId)
    .eq('source_reference', 'managed-assets')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
