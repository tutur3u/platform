import { X509Certificate } from 'node:crypto';
import {
  idpConfigSchema,
  requireCurrentCertificate,
  requireProtocol,
  SAML,
} from '../contracts';
import { append, documentRoot, newDocument, serialize } from './xml';

export function createIdpMetadata(config: unknown, now: () => Date): string {
  const idp = idpConfigSchema.parse(config);
  const certificates = [
    idp.signingCertificate,
    ...(idp.rolloverCertificates ?? []),
  ].map((pem) => {
    requireCurrentCertificate(pem, now());
    return new X509Certificate(pem);
  });
  requireProtocol(
    new Set(certificates.map((cert) => cert.fingerprint256)).size ===
      certificates.length,
    'DUPLICATE_CERTIFICATE'
  );
  const document = newDocument(SAML.metadata, 'md:EntityDescriptor');
  const root = documentRoot(document);
  root.setAttribute('entityID', idp.entityId);
  const descriptor = append(root, SAML.metadata, 'md:IDPSSODescriptor', {
    protocolSupportEnumeration: SAML.protocol,
    // Per-SP request-signature policy is enforced at admission.
    WantAuthnRequestsSigned: 'false',
  });
  // The signing certificate is first; rollover certificates follow so an SP
  // that imports metadata trusts the next key before it signs.
  for (const cert of certificates) {
    const key = append(descriptor, SAML.metadata, 'md:KeyDescriptor', {
      use: 'signing',
    });
    const info = append(key, SAML.signature, 'ds:KeyInfo');
    const data = append(info, SAML.signature, 'ds:X509Data');
    append(
      data,
      SAML.signature,
      'ds:X509Certificate',
      {},
      cert.raw.toString('base64')
    );
  }
  append(descriptor, SAML.metadata, 'md:NameIDFormat', {}, SAML.persistent);
  for (const binding of [SAML.redirect, SAML.post]) {
    append(descriptor, SAML.metadata, 'md:SingleSignOnService', {
      Binding: binding,
      Location: idp.ssoUrl,
    });
  }
  return serialize(document);
}
