import 'server-only';

import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

const signatureInput = z
  .object({
    id: z.uuid(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    requesterSessionId: z.uuid(),
    decidingSessionId: z.uuid(),
    action: z.enum(['approve', 'reject', 'enroll']),
    value: z.string().min(1).max(64),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .superRefine(({ action, value }, ctx) => {
    const valid =
      action === 'approve'
        ? /^[0-9]{2}$/.test(value)
        : action === 'reject'
          ? value === 'deny'
          : /^[a-f0-9]{64}$/.test(value);
    if (!valid)
      ctx.addIssue({ code: 'custom', message: 'Invalid signed action value' });
  });

export type ApprovalSignatureInput = z.input<typeof signatureInput>;

export function approvalSignatureMessage(input: ApprovalSignatureInput) {
  const value = signatureInput.parse(input);
  return Buffer.from(
    JSON.stringify([
      'tuturuuu.mobile-approval.v2',
      value.id,
      value.nonce,
      value.requesterSessionId,
      value.decidingSessionId,
      value.action,
      value.value,
      value.expiresAt,
    ]),
    'utf8'
  );
}

export function parseApprovalPublicKey(value: string) {
  if (!/^[A-Za-z0-9+/]{122}==$/.test(value)) {
    throw new Error('Invalid mobile approval public key');
  }
  const der = Buffer.from(value, 'base64');
  if (der.length !== 91 || der.toString('base64') !== value)
    throw new Error('Invalid mobile approval public key');
  const key = createPublicKey({ key: der, type: 'spki', format: 'der' });
  if (
    key.asymmetricKeyType !== 'ec' ||
    key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' ||
    !key.export({ type: 'spki', format: 'der' }).equals(der)
  )
    throw new Error('Invalid mobile approval public key');
  return { key, der };
}

export function verifyApprovalKeySignature(
  publicKey: string,
  input: ApprovalSignatureInput,
  signature: string
): boolean {
  if (!/^[A-Za-z0-9_-]{10,96}$/.test(signature)) return false;
  try {
    const bytes = Buffer.from(signature, 'base64url');
    const { key } = parseApprovalPublicKey(publicKey);
    return (
      bytes.length <= 72 &&
      bytes.toString('base64url') === signature &&
      verify('sha256', approvalSignatureMessage(input), key, bytes)
    );
  } catch {
    return false;
  }
}
