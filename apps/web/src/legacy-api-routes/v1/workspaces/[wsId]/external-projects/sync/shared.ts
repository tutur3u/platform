import { gunzipSync } from 'node:zlib';
import type { ExternalProjectSyncManifest } from '@tuturuuu/types';
import { z } from 'zod';
import { EXTERNAL_PROJECT_ADAPTER_OPTIONS } from '@/lib/external-projects/constants';
import {
  EXTERNAL_PROJECTS_STORAGE_PREFIX,
  isExternalProjectStoragePath,
} from '@/lib/external-projects/storage-path';

const externalProjectStoragePathSchema = z
  .string()
  .max(1024)
  .refine((path) => isExternalProjectStoragePath(path), {
    message: `storagePath must be under ${EXTERNAL_PROJECTS_STORAGE_PREFIX}`,
  });

const syncFieldSchema = z
  .object({
    defaultValue: z.unknown().optional(),
    description: z.string().nullable().optional(),
    key: z.string().min(1).max(120),
    label: z.string().nullable().optional(),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional(),
    type: z.enum([
      'boolean',
      'date',
      'datetime',
      'json',
      'markdown',
      'number',
      'string',
      'string-array',
    ]),
  })
  .passthrough();

const collectionSchema = z
  .object({
    assetTypes: z.array(z.string().min(1).max(120)).optional(),
    blockTypes: z.array(z.string().min(1).max(120)).optional(),
    collection_type: z.string().min(1).max(120),
    config: z.record(z.string(), z.unknown()).optional(),
    description: z.string().max(500).nullable().optional(),
    metadataFields: z.array(syncFieldSchema).optional(),
    profileFields: z.array(syncFieldSchema).optional(),
    slug: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
  })
  .passthrough();

const blockSchema = z
  .object({
    blockType: z.string().min(1).max(120),
    content: z.record(z.string(), z.unknown()).optional(),
    sortOrder: z.number().int().min(0).optional(),
    stableSourceId: z.string().max(300).nullable().optional(),
    title: z.string().max(160).nullable().optional(),
  })
  .passthrough();

const assetSchema = z
  .object({
    altText: z.string().max(500).nullable().optional(),
    assetType: z.string().min(1).max(120),
    blockStableSourceId: z.string().max(300).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    sortOrder: z.number().int().min(0).optional(),
    sourceUrl: z.string().url().nullable().optional(),
    stableSourceId: z.string().max(300).nullable().optional(),
    storagePath: externalProjectStoragePathSchema.nullable().optional(),
  })
  .passthrough();

export const syncManifestSchema = z
  .object({
    adapter: z.enum(EXTERNAL_PROJECT_ADAPTER_OPTIONS),
    canonicalProjectId: z.string().nullable().optional(),
    content: z.object({
      entries: z.array(
        z
          .object({
            assets: z.array(assetSchema).optional(),
            blocks: z.array(blockSchema).optional(),
            collectionSlug: z.string().min(1).max(120),
            delete: z.boolean().optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            profileData: z.record(z.string(), z.unknown()).optional(),
            scheduledFor: z.string().datetime().nullable().optional(),
            slug: z.string().min(1).max(120),
            stableSourceId: z.string().max(300).nullable().optional(),
            status: z
              .enum(['draft', 'scheduled', 'published', 'archived'])
              .optional(),
            subtitle: z.string().max(200).nullable().optional(),
            summary: z.string().max(1000).nullable().optional(),
            title: z.string().min(1).max(160),
          })
          .passthrough()
      ),
    }),
    schema: z
      .object({
        collections: z.array(collectionSchema),
        metadataFields: z.array(syncFieldSchema).optional(),
        profileFields: z.array(syncFieldSchema).optional(),
      })
      .passthrough(),
    version: z.literal(1),
  })
  .passthrough();

export const syncManifestRequestSchema = z.object({
  force: z.boolean().optional(),
  manifest: syncManifestSchema,
});

const MAX_SYNC_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_SYNC_MANIFEST_BYTES = 4 * 1024 * 1024;

export class SyncManifestRequestBodyError extends Error {}

async function readRequestBytes(request: Request, limit: number) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new SyncManifestRequestBodyError('Oversized sync manifest');
  }

  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > limit) {
      await reader.cancel();
      throw new SyncManifestRequestBodyError('Oversized sync manifest');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, totalBytes);
}

export function parseSyncManifestRequest(value: unknown): {
  force?: boolean;
  manifest: ExternalProjectSyncManifest;
} {
  const parsed = syncManifestRequestSchema.parse(value);

  return {
    force: parsed.force,
    manifest: parsed.manifest as ExternalProjectSyncManifest,
  };
}

export async function readSyncManifestRequest(request: Request): Promise<{
  force?: boolean;
  manifest: ExternalProjectSyncManifest;
}> {
  return parseSyncManifestRequest(await readSyncJsonRequest(request));
}

export async function readSyncJsonRequest(request: Request): Promise<unknown> {
  const contentEncoding =
    request.headers.get('content-encoding')?.trim().toLowerCase() ?? 'identity';

  if (contentEncoding !== 'identity' && contentEncoding !== 'gzip') {
    throw new SyncManifestRequestBodyError(
      `Unsupported Content-Encoding: ${contentEncoding}`
    );
  }

  let decoded: Buffer;
  try {
    const encoded = await readRequestBytes(
      request,
      contentEncoding === 'gzip'
        ? MAX_COMPRESSED_SYNC_MANIFEST_BYTES
        : MAX_SYNC_MANIFEST_BYTES
    );
    decoded =
      contentEncoding === 'gzip'
        ? gunzipSync(encoded, { maxOutputLength: MAX_SYNC_MANIFEST_BYTES })
        : encoded;
  } catch {
    throw new SyncManifestRequestBodyError(
      'Invalid or oversized sync manifest'
    );
  }

  try {
    return JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new SyncManifestRequestBodyError('Invalid JSON sync manifest');
  }
}
