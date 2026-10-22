import 'server-only';

import { createHash } from 'node:crypto';
import { endpointSchema, SsoError, spProfileSchema } from '@tuturuuu/sso';
import { z } from 'zod';

export const enabled = () => process.env.SSO_SAML_ENABLED === 'true';
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const envSchema = z.object({
  origin: endpointSchema.refine((s) => `${new URL(s).origin}/` === s),
  clientId: z.uuid(),
  signingKid: z.string().min(1).max(128),
  privateKey: z.string().min(1),
  transactionSecret: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  requestSigning: spProfileSchema.unwrap().shape.requestSigning,
});
export function configuration() {
  if (!enabled()) throw new SsoError({ code: 'disabled' });
  const signing = process.env.SSO_SAML_REQUEST_SIGNING;
  const parsed = envSchema.safeParse({
    origin: process.env.SSO_SAML_ORIGIN,
    clientId: process.env.SSO_SAML_CLIENT_ID,
    signingKid: process.env.SSO_SAML_SIGNING_KID,
    privateKey: process.env.SSO_SAML_SIGNING_KEY,
    transactionSecret: process.env.SSO_SAML_TRANSACTION_SECRET,
    requestSigning:
      signing === 'unsigned'
        ? { mode: 'unsigned' }
        : signing === 'required'
          ? {
              mode: 'required',
              certificate: process.env.SSO_SAML_SP_CERTIFICATE,
            }
          : null,
  });
  if (!parsed.success) throw new SsoError({ code: 'unavailable' });
  return parsed.data;
}
export type SsoConfiguration = ReturnType<typeof configuration>;

export const privateHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
