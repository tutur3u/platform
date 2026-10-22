import {
  assuranceSchema,
  identitySchema,
  idpConfigSchema,
  type ProtocolDependencies,
  requireCurrentCertificate,
  requireFreshRequest,
  requireProtocol,
  SAML,
  samlIdSchema,
  spProfileSchema,
  validatedRequestSchema,
} from '../contracts';
import { append, documentRoot, newDocument, parseXml, serialize } from './xml';

/** Protocol construction only. The caller must authorize and consume a transaction first. */
export function createLoginResponse(
  input: {
    profile: unknown;
    idp: unknown;
    request: unknown;
    identity: unknown;
    assurance: unknown;
  },
  dependencies: ProtocolDependencies
) {
  const profile = spProfileSchema.parse(input.profile);
  const idp = idpConfigSchema.parse(input.idp);
  const request = validatedRequestSchema.parse(input.request);
  const identity = identitySchema.parse(input.identity);
  const assurance = assuranceSchema.parse(input.assurance);
  const now = dependencies.now();
  requireCurrentCertificate(idp.signingCertificate, now);
  requireFreshRequest(request, now);
  requireProtocol(
    request.issuer === profile.entityId &&
      request.acsUrl === profile.acsUrl &&
      request.destination === idp.ssoUrl &&
      request.nameIdFormat === profile.nameIdFormat &&
      (profile.requestSigning.mode !== 'required' ||
        request.provenance === 'signed'),
    'REQUEST_PROFILE'
  );
  const primaryAt = Date.parse(assurance.authenticatedAt);
  const mfaAt = Date.parse(assurance.mfaVerifiedAt);
  requireProtocol(
    mfaAt <= now.getTime() &&
      now.getTime() - mfaAt <= 600_000 &&
      primaryAt <= mfaAt,
    'FRESH_MFA_REQUIRED'
  );
  requireProtocol(
    !request.forceAuthn ||
      (primaryAt >= Date.parse(request.issueInstant) &&
        mfaAt >= Date.parse(request.issueInstant)),
    'FORCE_AUTHN_REQUIRED'
  );
  const responseId = samlIdSchema.parse(dependencies.generateId());
  const assertionId = samlIdSchema.parse(dependencies.generateId());
  requireProtocol(
    new Set([responseId, assertionId, request.id]).size === 3,
    'ID_COLLISION'
  );
  const instant = now.toISOString();
  const expires = new Date(now.getTime() + 120_000).toISOString();
  const assertion = newDocument(SAML.assertion, 'saml:Assertion');
  const a = documentRoot(assertion);
  a.setAttribute('ID', assertionId);
  a.setAttribute('Version', '2.0');
  a.setAttribute('IssueInstant', instant);
  append(a, SAML.assertion, 'saml:Issuer', {}, idp.entityId);
  const subject = append(a, SAML.assertion, 'saml:Subject');
  append(
    subject,
    SAML.assertion,
    'saml:NameID',
    {
      Format: SAML.persistent,
      NameQualifier: idp.entityId,
      SPNameQualifier: profile.entityId,
    },
    identity.pairwiseSubject
  );
  const confirmation = append(
    subject,
    SAML.assertion,
    'saml:SubjectConfirmation',
    {
      Method: 'urn:oasis:names:tc:SAML:2.0:cm:bearer',
    }
  );
  append(confirmation, SAML.assertion, 'saml:SubjectConfirmationData', {
    Recipient: profile.acsUrl,
    InResponseTo: request.id,
    NotOnOrAfter: expires,
  });
  const conditions = append(a, SAML.assertion, 'saml:Conditions', {
    NotBefore: new Date(now.getTime() - 30_000).toISOString(),
    NotOnOrAfter: expires,
  });
  const audience = append(
    conditions,
    SAML.assertion,
    'saml:AudienceRestriction'
  );
  append(audience, SAML.assertion, 'saml:Audience', {}, profile.entityId);
  const statement = append(a, SAML.assertion, 'saml:AuthnStatement', {
    AuthnInstant: assurance.mfaVerifiedAt,
    SessionIndex: assertionId,
    SessionNotOnOrAfter: expires,
  });
  const context = append(statement, SAML.assertion, 'saml:AuthnContext');
  append(context, SAML.assertion, 'saml:AuthnContextClassRef', {}, SAML.mfa);
  const attributes = append(a, SAML.assertion, 'saml:AttributeStatement');
  for (const [name, value] of Object.entries({
    id: identity.pairwiseSubject,
    email: identity.email,
    firstName: identity.firstName,
    lastName: identity.lastName,
  })) {
    const attr = append(attributes, SAML.assertion, 'saml:Attribute', {
      Name: name,
      NameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
    });
    append(attr, SAML.assertion, 'saml:AttributeValue', {}, value);
  }
  const signedAssertion = dependencies.signer({
    xml: serialize(assertion),
    id: assertionId,
    kind: 'Assertion',
  });
  const response = newDocument(SAML.protocol, 'samlp:Response');
  const r = documentRoot(response);
  for (const [key, value] of Object.entries({
    ID: responseId,
    Version: '2.0',
    IssueInstant: instant,
    Destination: profile.acsUrl,
    InResponseTo: request.id,
  }))
    r.setAttribute(key, value);
  append(r, SAML.assertion, 'saml:Issuer', {}, idp.entityId);
  const status = append(r, SAML.protocol, 'samlp:Status');
  append(status, SAML.protocol, 'samlp:StatusCode', {
    Value: 'urn:oasis:names:tc:SAML:2.0:status:Success',
  });
  r.appendChild(
    response.importNode(documentRoot(parseXml(signedAssertion)), true)
  );
  const xml = dependencies.signer({
    xml: serialize(response),
    id: responseId,
    kind: 'Response',
  });
  const elapsed = dependencies.now().getTime() - now.getTime();
  requireProtocol(elapsed >= 0 && elapsed <= 5000, 'ISSUANCE_EXPIRED');
  return Object.freeze({
    xml,
    samlResponse: Buffer.from(xml).toString('base64'),
    destination: profile.acsUrl,
    relayState: request.relayState,
    responseId,
    assertionId,
    expiresAt: expires,
  });
}
