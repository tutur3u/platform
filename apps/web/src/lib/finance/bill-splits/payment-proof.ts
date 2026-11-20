import { z } from 'zod';

export const proofImageType = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const paymentProof = z.strictObject({
  contentType: proofImageType,
  base64: z.string().min(4).max(349528),
});

export function validPaymentProof(proof: z.infer<typeof paymentProof>) {
  const bytes = Buffer.from(proof.base64, 'base64');
  if (
    bytes.length === 0 ||
    bytes.length > 262144 ||
    bytes.toString('base64') !== proof.base64
  ) {
    return false;
  }
  switch (proof.contentType) {
    case 'image/png':
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/jpeg':
      return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    case 'image/webp':
      return (
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
  }
}
