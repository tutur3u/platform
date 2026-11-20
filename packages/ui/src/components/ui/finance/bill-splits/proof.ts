import type { BillSplitProof } from '@tuturuuu/internal-api/finance-bill-splits';

export async function encodeSplitProof(file: File): Promise<BillSplitProof> {
  const contentType = file.type;
  if (
    file.size === 0 ||
    file.size > 262144 ||
    (contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp')
  ) {
    throw new RangeError('Unsupported proof file');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return { contentType, base64: btoa(chunks.join('')) };
}
