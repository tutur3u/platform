import {
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import {
  certificateSchema,
  requireProtocol,
  SAML,
  type SamlSigner,
} from '../contracts';

/** Dedicated Node adapter; key material stays in this closure, never the domain config. */
export function createNodeSigner(input: {
  privateKey: string;
  certificate: string;
}): SamlSigner {
  const cert = new X509Certificate(certificateSchema.parse(input.certificate));
  const key = createPrivateKey(input.privateKey);
  requireProtocol(
    key.asymmetricKeyType === 'rsa' &&
      (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048,
    'SIGNING_KEY'
  );
  requireProtocol(
    createPublicKey(key)
      .export({ type: 'spki', format: 'der' })
      .equals(cert.publicKey.export({ type: 'spki', format: 'der' })),
    'KEY_MISMATCH'
  );
  return ({ xml, id, kind }) => {
    const signature = new SignedXml({
      privateKey: key,
      publicCert: input.certificate,
      signatureAlgorithm: SAML.rsaSha256,
      canonicalizationAlgorithm: SAML.exclusive,
    });
    const namespace = kind === 'Response' ? SAML.protocol : SAML.assertion;
    const target = `/*[local-name()='${kind}' and namespace-uri()='${namespace}' and @ID='${id}']`;
    signature.addReference({
      xpath: target,
      transforms: [SAML.enveloped, SAML.exclusive],
      digestAlgorithm: SAML.sha256,
    });
    signature.computeSignature(xml, {
      location: {
        reference: `${target}/*[local-name()='Issuer' and namespace-uri()='${SAML.assertion}']`,
        action: 'after',
      },
      prefix: 'ds',
    });
    return signature.getSignedXml();
  };
}
