import { X509Certificate } from 'node:crypto';
import { idpConfigSchema, requireCurrentCertificate, SAML } from '../contracts';
import { append, documentRoot, newDocument, serialize } from './xml';

export function createIdpMetadata(config: unknown, now: () => Date): string {
  const idp = idpConfigSchema.parse(config);
  requireCurrentCertificate(idp.signingCertificate, now());
  const document = newDocument(SAML.metadata, 'md:EntityDescriptor');
  const root = documentRoot(document);
  root.setAttribute('entityID', idp.entityId);
  const descriptor = append(root, SAML.metadata, 'md:IDPSSODescriptor', {
    protocolSupportEnumeration: SAML.protocol,
    // Per-SP request-signature policy is enforced at admission.
    WantAuthnRequestsSigned: 'false',
  });
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
    new X509Certificate(idp.signingCertificate).raw.toString('base64')
  );
  append(descriptor, SAML.metadata, 'md:NameIDFormat', {}, SAML.persistent);
  for (const binding of [SAML.redirect, SAML.post]) {
    append(descriptor, SAML.metadata, 'md:SingleSignOnService', {
      Binding: binding,
      Location: idp.ssoUrl,
    });
  }
  return serialize(document);
}
