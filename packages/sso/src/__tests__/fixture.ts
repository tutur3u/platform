import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { SAML as NodeSaml, ValidateInResponseTo } from '@node-saml/node-saml';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { SAML, samlIdSchema, spProfileSchema } from '../contracts';
import { createNodeSigner } from '../saml/node-signer';
import { parseAuthnRequest } from '../saml/request';
import { createLoginResponse } from '../saml/response';

export function fixture() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  // Private key exists only in memory and the child stdin pipe.
  const certificate = execFileSync(
    'openssl',
    [
      'req',
      '-new',
      '-x509',
      '-key',
      '/dev/stdin',
      '-subj',
      '/CN=Disposable SSO test',
      '-days',
      '1',
      '-sha256',
    ],
    { input: privateKey, encoding: 'utf8' }
  );
  const idp = {
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    signingCertificate: certificate,
  };
  const profile = spProfileSchema.parse({
    entityId: 'urn:example:workos:sp',
    acsUrl: 'https://sp.example.test/acs',
    nameIdFormat: SAML.persistent,
    requestSigning: { mode: 'unsigned' },
  });
  const identity = {
    pairwiseSubject: randomUUID(),
    email: 'invited@example.test',
    firstName: 'Given <script>& "',
    lastName: 'Family',
  };
  const signer = createNodeSigner({ privateKey, certificate });
  const now = new Date();
  const assurance = {
    method: 'totp-mfa',
    authenticatedAt: now.toISOString(),
    mfaVerifiedAt: now.toISOString(),
  };
  const requestXml = (attributes = '', child = '') =>
    `<p:AuthnRequest xmlns:p="${SAML.protocol}" xmlns:a="${SAML.assertion}" ID="_request" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${idp.ssoUrl}" AssertionConsumerServiceURL="${profile.acsUrl}" ${attributes}><a:Issuer>${profile.entityId}</a:Issuer>${child}</p:AuthnRequest>`;
  const form = (
    xml = requestXml(),
    binding: 'redirect' | 'post' = 'redirect'
  ) =>
    new URLSearchParams({
      SAMLRequest: (binding === 'redirect'
        ? deflateRawSync(Buffer.from(xml))
        : Buffer.from(xml)
      ).toString('base64'),
      RelayState: 'opaque-handle',
    }).toString();
  const parse = (
    xml = requestXml(),
    binding: 'redirect' | 'post' = 'redirect',
    profiles: readonly unknown[] = [profile]
  ) =>
    parseAuthnRequest(
      binding === 'redirect'
        ? { binding, rawQuery: form(xml, binding) }
        : { binding, body: form(xml, binding) },
      { idp, profiles, now: () => now }
    );
  const request = parse();
  const response = (
    overrides: Partial<Parameters<typeof createLoginResponse>[0]> = {}
  ) =>
    createLoginResponse(
      {
        profile,
        idp,
        request,
        identity,
        assurance,
        ...overrides,
      },
      { now: () => now, generateId: () => `_${randomUUID()}`, signer }
    );
  function signedRedirect(xml = requestXml()) {
    const raw = `${form(xml)}&SigAlg=${encodeURIComponent(SAML.rsaSha256)}`;
    return `${raw}&Signature=${encodeURIComponent(sign('RSA-SHA256', Buffer.from(raw), privateKey).toString('base64'))}`;
  }
  return {
    privateKey,
    certificate,
    idp,
    profile,
    identity,
    signer,
    now,
    assurance,
    requestXml,
    form,
    parse,
    request,
    response,
    signedRedirect,
  };
}
export type Fixture = ReturnType<typeof fixture>;

/** Independent SP path: Node-SAML owns signature, audience, time, and replay checks. */
export async function serviceProvider(f: Fixture) {
  const sp = new NodeSaml({
    issuer: f.profile.entityId,
    callbackUrl: f.profile.acsUrl,
    idpCert: f.certificate,
    idpIssuer: f.idp.entityId,
    audience: f.profile.entityId,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    acceptedClockSkewMs: 0,
    maxAssertionAgeMs: 120_000,
  });
  await sp.cacheProvider.saveAsync(f.request.id, f.now.toISOString());
  return {
    sp,
    async accept(xml: string) {
      const { profile } = await sp.validatePostResponseAsync({
        SAMLResponse: Buffer.from(xml).toString('base64'),
      });
      if (!profile) throw new Error('SP_NO_PROFILE');
      // Node-SAML 5.1.0 does not enforce Destination/Recipient for login responses.
      // The top-level signature is mandatory above; assertion XML is authenticated by Node-SAML.
      const response = new DOMParser().parseFromString(
        xml,
        'application/xml'
      ).documentElement;
      assert.ok(response && profile.getAssertionXml);
      const assertion = new DOMParser().parseFromString(
        profile.getAssertionXml(),
        'application/xml'
      ).documentElement;
      assert.ok(assertion);
      const data = assertion.getElementsByTagNameNS(
        SAML.assertion,
        'SubjectConfirmationData'
      );
      if (
        response.getAttribute('Destination') !== f.profile.acsUrl ||
        data.length !== 1 ||
        data[0]?.getAttribute('Recipient') !== f.profile.acsUrl
      )
        throw new Error('SP_ACS_MISMATCH');
      if (profile.issuer !== f.idp.entityId)
        throw new Error('SP_ISSUER_MISMATCH');
      return profile;
    },
  };
}

/** Forge protocol-invalid but correctly signed fixtures, so semantic checks must run. */
export function resign(
  f: Fixture,
  xml: string,
  mutate: (doc: ReturnType<DOMParser['parseFromString']>) => void,
  signAssertion = true
): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  assert.ok(doc.documentElement);
  const signatures = Array.from(
    doc.getElementsByTagNameNS(SAML.signature, 'Signature')
  );
  for (const signature of signatures)
    signature.parentNode?.removeChild(signature);
  mutate(doc);
  const assertion = doc.getElementsByTagNameNS(SAML.assertion, 'Assertion')[0];
  if (!assertion) throw new Error('fixture assertion absent');
  const serializer = new XMLSerializer();
  if (signAssertion) {
    const signed = f.signer({
      xml: serializer.serializeToString(assertion),
      id: samlIdSchema.parse(assertion.getAttribute('ID')),
      kind: 'Assertion',
    });
    const signedRoot = new DOMParser().parseFromString(
      signed,
      'application/xml'
    ).documentElement;
    assert.ok(signedRoot);
    assertion.parentNode?.replaceChild(
      doc.importNode(signedRoot, true),
      assertion
    );
  }
  return f.signer({
    xml: serializer.serializeToString(doc),
    id: samlIdSchema.parse(doc.documentElement.getAttribute('ID')),
    kind: 'Response',
  });
}

export function signPostRequest(
  f: Fixture,
  xml = f.requestXml(),
  target = "/*[local-name()='AuthnRequest']"
) {
  const signature = new SignedXml({
    privateKey: f.privateKey,
    publicCert: f.certificate,
    signatureAlgorithm: SAML.rsaSha256,
    canonicalizationAlgorithm: SAML.exclusive,
  });
  signature.addReference({
    xpath: target,
    transforms: [SAML.enveloped, SAML.exclusive],
    digestAlgorithm: SAML.sha256,
  });
  signature.computeSignature(xml, {
    location: { reference: "//*[local-name()='Issuer']", action: 'after' },
  });
  return signature.getSignedXml();
}
