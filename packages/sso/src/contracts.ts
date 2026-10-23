import { X509Certificate } from 'node:crypto';
import { z } from 'zod';

export const SAML = {
  protocol: 'urn:oasis:names:tc:SAML:2.0:protocol',
  assertion: 'urn:oasis:names:tc:SAML:2.0:assertion',
  metadata: 'urn:oasis:names:tc:SAML:2.0:metadata',
  signature: 'http://www.w3.org/2000/09/xmldsig#',
  redirect: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
  post: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  persistent: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  mfa: 'https://refeds.org/profile/mfa',
  rsaSha256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
  exclusive: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
} as const;

// XML 1.0 characters only, including for strings serialized by a DOM library.
export const xmlText = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (s) =>
      Array.from(s).every((character) => {
        const code = character.codePointAt(0) ?? 0;
        return (
          [9, 10, 13].includes(code) ||
          (code >= 32 && code <= 0xd7ff) ||
          (code >= 0xe000 && code <= 0xfffd) ||
          (code >= 0x10000 && code <= 0x10ffff)
        );
      }),
    'Invalid XML characters'
  );
export const samlIdSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/)
  .brand<'SamlId'>();
// SAML entity IDs are URLs or URNs; never a script, data or local-file scheme.
const ENTITY_ID_SCHEMES = new Set(['http:', 'https:', 'urn:']);
export const entityIdSchema = xmlText.refine((s) => {
  try {
    return ENTITY_ID_SCHEMES.has(new URL(s).protocol) && !/\s/.test(s);
  } catch {
    return false;
  }
}, 'Expected absolute entity URI');
export const endpointSchema = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      const u = new URL(s);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !s.includes('#') &&
        !u.port &&
        !s.includes('*') &&
        u.href === s
      );
    } catch {
      return false;
    }
  }, 'Expected canonical HTTPS endpoint without credentials, fragment, or custom port');

export const certificateSchema = z
  .string()
  .max(16384)
  .refine((s) => {
    try {
      if (
        !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/\r\n=]+-----END CERTIFICATE-----\s*$/.test(
          s
        )
      )
        return false;
      const cert = new X509Certificate(s);
      return (
        cert.publicKey.asymmetricKeyType === 'rsa' &&
        (cert.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048
      );
    } catch {
      return false;
    }
  }, 'Expected RSA X.509 certificate (at least 2048 bits)');

export const spProfileSchema = z
  .object({
    entityId: entityIdSchema,
    acsUrl: endpointSchema,
    nameIdFormat: z.literal(SAML.persistent),
    requestSigning: z.discriminatedUnion('mode', [
      z
        .object({ mode: z.literal('required'), certificate: certificateSchema })
        .strict(),
      z.object({ mode: z.literal('unsigned') }).strict(),
    ]),
  })
  .strict()
  .readonly();
export type SpProfile = z.infer<typeof spProfileSchema>;

export const idpConfigSchema = z
  .object({
    entityId: entityIdSchema,
    ssoUrl: endpointSchema,
    signingCertificate: certificateSchema,
  })
  .strict()
  .readonly();
export type IdpConfig = z.infer<typeof idpConfigSchema>;

export const validatedRequestSchema = z
  .object({
    id: samlIdSchema,
    issuer: entityIdSchema,
    destination: endpointSchema,
    acsUrl: endpointSchema,
    issueInstant: z.iso.datetime(),
    forceAuthn: z.boolean(),
    nameIdFormat: z.literal(SAML.persistent),
    allowCreate: z.boolean(),
    binding: z.enum(['redirect', 'post']),
    provenance: z.enum(['signed', 'unsigned']),
    relayState: z.string().max(80).optional(),
  })
  .strict()
  .readonly();
export type ValidatedRequest = z.infer<typeof validatedRequestSchema>;

export const identitySchema = z
  .object({
    // Persistence allocates this random value once per (client, Auth user).
    pairwiseSubject: z.union([z.uuid(), z.string().regex(/^[0-9a-f]{64}$/)]),
    email: z.email().max(254),
    firstName: xmlText.max(128),
    lastName: xmlText.max(128),
  })
  .strict();
export const assuranceSchema = z
  .object({
    method: z.literal('totp-mfa'),
    authenticatedAt: z.iso.datetime(),
    mfaVerifiedAt: z.iso.datetime(),
  })
  .strict();
export type SamlSigner = (input: {
  xml: string;
  id: z.infer<typeof samlIdSchema>;
  kind: 'Assertion' | 'Response';
}) => string;
export interface ProtocolDependencies {
  now: () => Date;
  generateId: () => string;
  signer: SamlSigner;
}

export function requireProtocol(
  condition: unknown,
  code: string
): asserts condition {
  if (!condition) throw new Error(`SAML_${code}`);
}

export function requireCurrentCertificate(pem: string, now: Date): void {
  const cert = new X509Certificate(pem);
  requireProtocol(
    now.getTime() >= Date.parse(cert.validFrom) &&
      now.getTime() < Date.parse(cert.validTo),
    'CERTIFICATE_EXPIRED'
  );
}

export function requireFreshRequest(
  request: ValidatedRequest,
  now: Date
): void {
  const age = now.getTime() - Date.parse(request.issueInstant);
  requireProtocol(age >= -30_000 && age <= 300_000, 'REQUEST_EXPIRED');
}
