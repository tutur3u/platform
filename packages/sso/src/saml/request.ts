import { inflateRawSync } from 'node:zlib';
import type { Element } from '@xmldom/xmldom';
import {
  idpConfigSchema,
  requireFreshRequest,
  requireProtocol,
  SAML,
  spProfileSchema,
  type ValidatedRequest,
  validatedRequestSchema,
} from '../contracts';
import { verifyRequestSignature } from './request-signature';
import {
  children,
  documentRoot,
  MAX_XML_BYTES,
  one,
  parseXml,
  restrictAttributes,
  textOnly,
} from './xml';

export type RequestInput =
  | { binding: 'redirect'; rawQuery: string }
  | { binding: 'post'; body: string };
const MAX_COMPRESSED_BYTES = 8192;

function decode(input: RequestInput) {
  const form = input.binding === 'redirect' ? input.rawQuery : input.body;
  requireProtocol(
    Buffer.byteLength(form) <= 65_536 && !form.startsWith('?'),
    'FORM_TOO_LARGE'
  );
  const fields = form.split('&');
  requireProtocol(fields.length <= 4, 'PARAMETERS');
  const raw = new Map<string, string>();
  for (const field of fields) {
    const index = field.indexOf('=');
    requireProtocol(index > 0, 'PARAMETERS');
    const key = field.slice(0, index);
    requireProtocol(
      ['SAMLRequest', 'RelayState', 'SigAlg', 'Signature'].includes(key) &&
        !raw.has(key),
      'PARAMETERS'
    );
    raw.set(key, field.slice(index + 1));
  }
  const params = new URLSearchParams(form);
  const encoded = params.get('SAMLRequest') ?? '';
  requireProtocol(
    encoded.length > 0 &&
      encoded.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
    'BASE64'
  );
  const bytes = Buffer.from(encoded, 'base64');
  requireProtocol(bytes.toString('base64') === encoded, 'BASE64');
  requireProtocol(
    bytes.length <=
      (input.binding === 'redirect' ? MAX_COMPRESSED_BYTES : MAX_XML_BYTES),
    'REQUEST_TOO_LARGE'
  );
  let xml: string;
  try {
    const inflated =
      input.binding === 'redirect'
        ? inflateRawSync(bytes, { maxOutputLength: MAX_XML_BYTES })
        : bytes;
    xml = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
  } catch {
    throw new Error('SAML_DECODE');
  }
  const relayState = params.get('RelayState');
  requireProtocol(
    relayState === null || Buffer.byteLength(relayState) <= 80,
    'RELAY_STATE'
  );
  return { root: documentRoot(parseXml(xml)), params, raw, relayState };
}

function booleanAttribute(element: Element, name: string, fallback: boolean) {
  const value = element.getAttribute(name);
  if (value === null) return fallback;
  requireProtocol(['true', 'false', '1', '0'].includes(value), 'BOOLEAN');
  return value === 'true' || value === '1';
}

/** No URL fetches. Profiles are a trusted, administratively registered allowlist. */
export function parseAuthnRequest(
  input: RequestInput,
  context: {
    profiles: readonly unknown[];
    idp: unknown;
    now: () => Date;
  }
): ValidatedRequest {
  const idp = idpConfigSchema.parse(context.idp);
  const profiles = context.profiles.map((profile) =>
    spProfileSchema.parse(profile)
  );
  requireProtocol(
    new Set(profiles.map((p) => p.entityId)).size === profiles.length,
    'DUPLICATE_SP'
  );
  const decoded = decode(input);
  const { root } = decoded;
  requireProtocol(
    root.namespaceURI === SAML.protocol && root.localName === 'AuthnRequest',
    'ROOT'
  );
  const issuer = textOnly(one(root, SAML.assertion, 'Issuer'));
  const profile = profiles.find((p) => p.entityId === issuer);
  requireProtocol(profile, 'UNKNOWN_SP');
  const now = context.now();
  const trusted = verifyRequestSignature({
    ...decoded,
    profile,
    binding: input.binding,
    now,
  });
  requireProtocol(
    trusted.namespaceURI === SAML.protocol &&
      trusted.localName === 'AuthnRequest' &&
      textOnly(one(trusted, SAML.assertion, 'Issuer')) === profile.entityId,
    'ROOT'
  );
  restrictAttributes(trusted, [
    'ID',
    'Version',
    'IssueInstant',
    'Destination',
    'AssertionConsumerServiceURL',
    'ProtocolBinding',
    'ForceAuthn',
    'IsPassive',
  ]);
  requireProtocol(
    trusted.getAttribute('Version') === '2.0' &&
      trusted.getAttribute('Destination') === idp.ssoUrl &&
      trusted.getAttribute('AssertionConsumerServiceURL') === profile.acsUrl,
    'DESTINATION'
  );
  const binding = trusted.getAttribute('ProtocolBinding');
  requireProtocol(!binding || binding === SAML.post, 'RESPONSE_BINDING');
  requireProtocol(
    !booleanAttribute(trusted, 'IsPassive', false),
    'PASSIVE_UNSUPPORTED'
  );
  const policy = children(trusted).filter(
    (n) => n.namespaceURI === SAML.protocol && n.localName === 'NameIDPolicy'
  );
  requireProtocol(policy.length <= 1, 'NAME_ID_POLICY');
  let allowCreate = true;
  if (policy[0]) {
    restrictAttributes(policy[0], ['Format', 'AllowCreate']);
    requireProtocol(
      children(policy[0]).length === 0 &&
        policy[0].getAttribute('Format') === profile.nameIdFormat,
      'NAME_ID_POLICY'
    );
    allowCreate = booleanAttribute(policy[0], 'AllowCreate', false);
  }
  const contexts = children(trusted).filter(
    (n) =>
      n.namespaceURI === SAML.protocol &&
      n.localName === 'RequestedAuthnContext'
  );
  requireProtocol(contexts.length <= 1, 'AUTHN_CONTEXT');
  if (contexts[0]) {
    restrictAttributes(contexts[0], ['Comparison']);
    requireProtocol(
      !contexts[0].getAttribute('Comparison') ||
        contexts[0].getAttribute('Comparison') === 'exact',
      'AUTHN_CONTEXT'
    );
    const refs = children(contexts[0]);
    requireProtocol(
      refs.length === 1 &&
        refs[0]?.namespaceURI === SAML.assertion &&
        refs[0].localName === 'AuthnContextClassRef' &&
        textOnly(refs[0]) === SAML.mfa,
      'AUTHN_CONTEXT'
    );
  }
  for (const child of children(trusted)) {
    requireProtocol(
      (child.namespaceURI === SAML.assertion && child.localName === 'Issuer') ||
        (child.namespaceURI === SAML.signature &&
          child.localName === 'Signature') ||
        (child.namespaceURI === SAML.protocol &&
          ['NameIDPolicy', 'RequestedAuthnContext'].includes(
            child.localName ?? ''
          )),
      'UNSUPPORTED_ELEMENT'
    );
  }
  const request = validatedRequestSchema.parse({
    id: trusted.getAttribute('ID'),
    issuer: profile.entityId,
    destination: idp.ssoUrl,
    acsUrl: profile.acsUrl,
    issueInstant: trusted.getAttribute('IssueInstant'),
    forceAuthn: booleanAttribute(trusted, 'ForceAuthn', false),
    allowCreate,
    nameIdFormat: profile.nameIdFormat,
    binding: input.binding,
    provenance:
      profile.requestSigning.mode === 'required' ? 'signed' : 'unsigned',
    ...(decoded.relayState === null ? {} : { relayState: decoded.relayState }),
  });
  requireFreshRequest(request, now);
  return request;
}
