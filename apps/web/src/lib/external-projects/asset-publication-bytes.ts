import { createHash } from 'node:crypto';
import {
  createWorkspaceStorageSignedReadUrl,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { isExternalProjectStoragePath } from './storage-path';

export const PUBLIC_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export function assetBytesDigest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readExternalProjectAssetBytes(
  workspaceId: string,
  path: string | null
) {
  if (!isExternalProjectStoragePath(path)) return null;
  const { provider } = await resolveWorkspaceStorageProvider(workspaceId);
  const providers = [provider, provider === 'r2' ? 'supabase' : 'r2'] as const;

  for (const candidate of providers) {
    try {
      const url = await createWorkspaceStorageSignedReadUrl(workspaceId, path, {
        expiresIn: 15,
        provider: candidate,
        requireExists: true,
      });
      const upstream = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.status !== 200 || !upstream.body) {
        await upstream.body?.cancel().catch(() => {});
        if (upstream.status === 404) continue;
        return null;
      }
      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (
          Number(upstream.headers.get('content-length')) >
          PUBLIC_ASSET_MAX_BYTES
        )
          return null;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > PUBLIC_ASSET_MAX_BYTES) return null;
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!size) return null;
      const buffer = Buffer.concat(chunks, size);
      return { buffer, contentType: upstream.headers.get('content-type') };
    } catch (error) {
      if (
        error instanceof WorkspaceStorageError &&
        (error.status === 404 || error.message.includes('not fully configured'))
      )
        continue;
      return null;
    }
  }
  return null;
}
