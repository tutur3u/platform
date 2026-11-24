/**
 * Builds and signs the SAML login response inside the Worker from the
 * structured input, through the same `@tuturuuu/sso` builder and
 * canonicalizer as the Node path; the Response and the Assertion are both
 * signed. The AuthnRequest itself (its parsing, signature and the profile's
 * request-signing policy) is admitted by `apps/web`; the Worker receives the
 * admitted request's bound fields, and the transaction confirmation checks
 * them against the consumed transaction.
 */
import { createLoginResponse, SAML, type SamlSigner } from '@tuturuuu/sso';
import { createNodeSigner } from '@tuturuuu/sso/node-signer';
import type { SignInput } from './input';

export type SignerFactory = (key: {
  privateKey: string;
  certificate: string;
}) => SamlSigner;

export const defaultSignerFactory: SignerFactory = createNodeSigner;

export function buildSignedResponse(
  input: SignInput,
  signer: SamlSigner,
  certificate: string,
  now: () => Date
) {
  return createLoginResponse(
    {
      profile: {
        entityId: input.profile.entityId,
        acsUrl: input.profile.acsUrl,
        nameIdFormat: SAML.persistent,
        requestSigning: { mode: 'unsigned' },
      },
      idp: {
        entityId: input.idp.entityId,
        ssoUrl: input.idp.ssoUrl,
        signingCertificate: certificate,
      },
      request: {
        id: input.request.id,
        issuer: input.profile.entityId,
        destination: input.idp.ssoUrl,
        acsUrl: input.profile.acsUrl,
        issueInstant: input.request.issueInstant,
        forceAuthn: input.request.forceAuthn,
        nameIdFormat: SAML.persistent,
        allowCreate: false,
        binding: 'post',
        provenance: 'unsigned',
        relayState: input.request.relayState,
      },
      identity: { pairwiseSubject: input.subject, ...input.attributes },
      assurance: { method: 'totp-mfa', ...input.assurance },
      notOnOrAfter: input.notOnOrAfter,
    },
    { now, generateId: () => `_${crypto.randomUUID()}`, signer }
  );
}
