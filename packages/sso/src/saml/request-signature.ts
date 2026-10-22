import { verify } from 'node:crypto';
import type { Element } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import {
  requireCurrentCertificate,
  requireProtocol,
  SAML,
  type SpProfile,
} from '../contracts';
import { children, documentRoot, one, parseXml, serialize } from './xml';

export function verifyRequestSignature(input: {
  root: Element;
  profile: SpProfile;
  binding: 'redirect' | 'post';
  raw: Map<string, string>;
  params: URLSearchParams;
  now: Date;
}): Element {
  const { root, profile, binding, raw, params, now } = input;
  const embedded = root.getElementsByTagNameNS(SAML.signature, 'Signature');
  const detached = params.has('Signature') || params.has('SigAlg');
  if (profile.requestSigning.mode === 'unsigned') {
    requireProtocol(!embedded.length && !detached, 'UNEXPECTED_SIGNATURE');
    return root;
  }
  const certificate = profile.requestSigning.certificate;
  requireCurrentCertificate(certificate, now);
  if (binding === 'redirect') {
    requireProtocol(
      !embedded.length &&
        params.get('SigAlg') === SAML.rsaSha256 &&
        params.has('Signature'),
      'SIGNATURE_REQUIRED'
    );
    const signed = `SAMLRequest=${raw.get('SAMLRequest')}${raw.has('RelayState') ? `&RelayState=${raw.get('RelayState')}` : ''}&SigAlg=${raw.get('SigAlg')}`;
    const signature = params.get('Signature') ?? '';
    requireProtocol(
      /^[A-Za-z0-9+/]+={0,2}$/.test(signature) &&
        signature.length <= 2048 &&
        verify(
          'RSA-SHA256',
          Buffer.from(signed),
          certificate,
          Buffer.from(signature, 'base64')
        ),
      'INVALID_SIGNATURE'
    );
    return root;
  }
  requireProtocol(!detached && embedded.length === 1, 'SIGNATURE_REQUIRED');
  const signature = one(root, SAML.signature, 'Signature');
  const info = one(signature, SAML.signature, 'SignedInfo');
  requireProtocol(
    one(info, SAML.signature, 'CanonicalizationMethod').getAttribute(
      'Algorithm'
    ) === SAML.exclusive &&
      one(info, SAML.signature, 'SignatureMethod').getAttribute('Algorithm') ===
        SAML.rsaSha256,
    'SIGNATURE_ALGORITHM'
  );
  const reference = one(info, SAML.signature, 'Reference');
  requireProtocol(
    reference.getAttribute('URI') === `#${root.getAttribute('ID')}` &&
      one(reference, SAML.signature, 'DigestMethod').getAttribute(
        'Algorithm'
      ) === SAML.sha256,
    'SIGNATURE_REFERENCE'
  );
  const transforms = children(one(reference, SAML.signature, 'Transforms'));
  requireProtocol(
    transforms.length === 2 &&
      transforms[0]?.getAttribute('Algorithm') === SAML.enveloped &&
      transforms[1]?.getAttribute('Algorithm') === SAML.exclusive,
    'SIGNATURE_ALGORITHM'
  );
  let verified: string[];
  try {
    const verifier = new SignedXml({
      publicCert: certificate,
      getCertFromKeyInfo: () => null,
    });
    verifier.loadSignature(serialize(signature));
    requireProtocol(
      verifier.checkSignature(serialize(root)),
      'INVALID_SIGNATURE'
    );
    verified = verifier.getSignedReferences();
  } catch {
    throw new Error('SAML_INVALID_SIGNATURE');
  }
  requireProtocol(verified.length === 1 && verified[0], 'SIGNATURE_REFERENCE');
  // Only authenticated bytes become the request domain object.
  return documentRoot(parseXml(verified[0]));
}
