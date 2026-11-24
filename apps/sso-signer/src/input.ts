/**
 * The structured sign request. The Worker is not a raw signing oracle: the
 * caller sends these fields, and the Worker builds the SAML response from
 * them through `@tuturuuu/sso` before signing it.
 */
import {
  assuranceSchema,
  endpointSchema,
  entityIdSchema,
  identitySchema,
  samlIdSchema,
} from '@tuturuuu/sso';
import { z } from 'zod';

/** Lowercase letters, digits and hyphens, so the secret name is injective. */
export const kidSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u);

/** `SSO_SIGNING_KEY_<KID>`: the kid upper-cased with `-` as `_`. */
export function signingKeySecretName(kid: string): string {
  return `SSO_SIGNING_KEY_${kid.toUpperCase().replaceAll('-', '_')}`;
}

const identity = identitySchema.shape;

export const signInputSchema = z
  .object({
    client: z.uuid(),
    protocol: z.literal('saml'),
    transactionId: z.uuid(),
    kid: kidSchema,
    subject: identity.pairwiseSubject,
    attributes: z
      .object({
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
      })
      .strict(),
    profile: z
      .object({ entityId: entityIdSchema, acsUrl: endpointSchema })
      .strict(),
    idp: z
      .object({ entityId: entityIdSchema, ssoUrl: endpointSchema })
      .strict(),
    request: z
      .object({
        id: samlIdSchema,
        issueInstant: z.iso.datetime(),
        forceAuthn: z.boolean(),
        relayState: z.string().max(80).optional(),
      })
      .strict(),
    assurance: assuranceSchema.pick({
      authenticatedAt: true,
      mfaVerifiedAt: true,
    }),
    notOnOrAfter: z.iso.datetime(),
  })
  .strict();
export type SignInput = z.infer<typeof signInputSchema>;
