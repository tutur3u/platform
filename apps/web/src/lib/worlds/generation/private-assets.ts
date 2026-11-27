import type { GenerationAssetStorage } from '@tuturuuu/worlds/generation';
import {
  matchesWorldsScope,
  type WorldsGenerationScope,
  worldsProviderLimits,
} from './adapter';

/**
 * Resolve immutable private bytes by server-bound workspace, world, actor, and
 * upload ID. Implementations must resolve the scoped upload record and object
 * version, observe abort, and open a bounded stream without exposing a URL.
 */
export type OpenWorldsPrivateUpload = (
  scope: WorldsGenerationScope,
  uploadId: string,
  signal: AbortSignal
) => Promise<{
  mediaType: string;
  byteLength: number;
  body: ReadableStream<Uint8Array>;
} | null>;

export function createWorldsPrivateAssetStorage(
  scope: WorldsGenerationScope,
  open: OpenWorldsPrivateUpload
): GenerationAssetStorage {
  return {
    async read({ request, signal }, source) {
      if (
        request.kind === 'prompt' ||
        !matchesWorldsScope(scope, request) ||
        request.source.id !== source.id ||
        request.source.mediaType !== source.mediaType ||
        request.source.byteLength !== source.byteLength ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(source.id)
      )
        return null;

      const max =
        request.kind === 'image'
          ? worldsProviderLimits.imageBytes
          : worldsProviderLimits.textBytes;
      if (
        signal.aborted ||
        !Number.isSafeInteger(source.byteLength) ||
        source.byteLength < 1 ||
        source.byteLength > max
      )
        return null;

      const upload = await open(scope, source.id, signal);
      if (!upload) return null;
      const reader = upload.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (
          signal.aborted ||
          upload.byteLength !== source.byteLength ||
          upload.mediaType !== source.mediaType
        )
          return null;
        const bytes = new Uint8Array(source.byteLength);
        let offset = 0;
        let reads = 0;
        // Allow a read per byte, EOF, and a fixed allowance for empty chunks.
        const readBudget = bytes.length + 1 + 1024;
        while (reads++ < readBudget && !signal.aborted) {
          const { done, value } = await reader.read();
          if (done)
            return offset === bytes.length && !signal.aborted ? bytes : null;
          if (value.byteLength > bytes.length - offset) return null;
          bytes.set(value, offset);
          offset += value.byteLength;
        }
        return null;
      } finally {
        signal.removeEventListener('abort', cancel);
        cancel();
      }
    },
  };
}
