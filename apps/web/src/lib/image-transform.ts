import 'server-only';

import { isWorkerRuntime } from './server-runtime';

export interface ImageDecodeOptions {
  limitInputPixels: number;
  failOn: 'warning';
  pages?: number;
}

export interface ImageRenderOptions {
  width: number;
  height: number;
  quality: number;
  effort: number;
}

/** Each render reads the original frame, auto-orients, and strips metadata. */
export interface DecodedImage {
  metadata(): Promise<{ format?: string; pages?: number }>;
  webp(options: ImageRenderOptions): Promise<Buffer>;
  destroy(): void;
}

export interface ImageTransformer {
  decode(input: Buffer, options: ImageDecodeOptions): DecodedImage;
}

/** Workers use the IMAGES binding (Cloudflare Images); Node retains sharp. */
export async function getImageTransformer(
  adapter?: ImageTransformer
): Promise<ImageTransformer> {
  if (adapter) return adapter;
  if (isWorkerRuntime()) {
    const transformer = await (
      await import('./image-transform.workers')
    ).workerImageTransformer();
    if (!transformer) {
      throw new Error('Worker image transformer is not configured');
    }
    return transformer;
  }
  return (await import('./image-transform.node')).sharpImageTransformer;
}
