import { deflateRawSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { SAML } from '../contracts';
import { parseAuthnRequest } from '../saml/request';
import { type Fixture, fixture, signPostRequest } from './fixture';

let f: Fixture;
beforeAll(() => {
  f = fixture();
});

describe('AuthnRequest registered profile and bounded XML boundary', () => {
  it.each(['redirect', 'post'] as const)(
    'accepts explicitly unsigned %s requests',
    (binding) => {
      expect(f.parse(undefined, binding)).toMatchObject({
        id: '_request',
        acsUrl: f.profile.acsUrl,
        provenance: 'unsigned',
        forceAuthn: false,
      });
    }
  );

  it('accepts pinned RSA-SHA256 Redirect signatures over original percent-encoded bytes', () => {
    const profile = {
      ...f.profile,
      requestSigning: { mode: 'required', certificate: f.certificate },
    };
    expect(
      parseAuthnRequest(
        { binding: 'redirect', rawQuery: f.signedRedirect() },
        { profiles: [profile], idp: f.idp, now: () => f.now }
      ).provenance
    ).toBe('signed');
  });

  it('accepts a signed POST request using only its authenticated reference', () => {
    // The signature adapter signs SAML roots; AuthnRequest signing is an independent test setup.
    const signed = signPostRequest(f);
    const profile = {
      ...f.profile,
      requestSigning: { mode: 'required', certificate: f.certificate },
    };
    expect(f.parse(signed, 'post', [profile]).provenance).toBe('signed');
  });

  it('rejects missing required request signatures', () => {
    const profile = {
      ...f.profile,
      requestSigning: { mode: 'required', certificate: f.certificate },
    };
    expect(() => f.parse(undefined, 'redirect', [profile])).toThrow(
      'SAML_SIGNATURE_REQUIRED'
    );
    expect(() => f.parse(undefined, 'post', [profile])).toThrow(
      'SAML_SIGNATURE_REQUIRED'
    );
  });

  it('rejects tampering, unpinned certificates and SHA-1 on Redirect', () => {
    const profile = {
      ...f.profile,
      requestSigning: { mode: 'required', certificate: f.certificate },
    };
    const parse = (rawQuery: string, profiles = [profile]) =>
      parseAuthnRequest(
        { binding: 'redirect', rawQuery },
        { profiles, idp: f.idp, now: () => f.now }
      );
    expect(() =>
      parse(f.signedRedirect().replace('opaque-handle', 'other-handle'))
    ).toThrow('SAML_INVALID_SIGNATURE');
    // A second fixture mints its certificate later (second-granularity
    // notBefore); validate at its clock so only the pin mismatch can fail.
    const unpinned = fixture();
    expect(() =>
      parseAuthnRequest(
        { binding: 'redirect', rawQuery: f.signedRedirect() },
        {
          profiles: [
            {
              ...profile,
              requestSigning: {
                mode: 'required',
                certificate: unpinned.certificate,
              },
            },
          ],
          idp: f.idp,
          now: () => unpinned.now,
        }
      )
    ).toThrow('SAML_INVALID_SIGNATURE');
    expect(() =>
      parse(
        f
          .signedRedirect()
          .replace(
            encodeURIComponent(SAML.rsaSha256),
            encodeURIComponent('rsa-sha1')
          )
      )
    ).toThrow('SAML_SIGNATURE_REQUIRED');
  });

  it.each([
    [
      'unknown SP',
      (xml: string) => xml.replace(f.profile.entityId, 'urn:unknown'),
      'UNKNOWN_SP',
    ],
    [
      'wrong destination',
      (xml: string) => xml.replace(f.idp.ssoUrl, `${f.idp.ssoUrl}/`),
      'DESTINATION',
    ],
    [
      'wrong ACS',
      (xml: string) =>
        xml.replace(f.profile.acsUrl, `${f.profile.acsUrl}?evil=1`),
      'DESTINATION',
    ],
    [
      'stale request',
      (xml: string) =>
        xml.replace(
          f.now.toISOString(),
          new Date(f.now.getTime() - 300_001).toISOString()
        ),
      'REQUEST_EXPIRED',
    ],
    [
      'future request',
      (xml: string) =>
        xml.replace(
          f.now.toISOString(),
          new Date(f.now.getTime() + 30_001).toISOString()
        ),
      'REQUEST_EXPIRED',
    ],
    [
      'invalid ID',
      (xml: string) => xml.replace('ID="_request"', 'ID="bad id"'),
      '',
    ],
    [
      'wrong version',
      (xml: string) => xml.replace('Version="2.0"', 'Version="1.1"'),
      'DESTINATION',
    ],
  ])('rejects %s', (_label, mutate, code) => {
    expect(() => f.parse(mutate(f.requestXml()))).toThrow(
      code ? `SAML_${code}` : undefined
    );
  });

  it('honors ForceAuthn and rejects interactive passive requests', () => {
    expect(f.parse(f.requestXml('ForceAuthn="true"')).forceAuthn).toBe(true);
    expect(() => f.parse(f.requestXml('IsPassive="true"'))).toThrow(
      'SAML_PASSIVE_UNSUPPORTED'
    );
    expect(() => f.parse(f.requestXml('ForceAuthn="yes"'))).toThrow(
      'SAML_BOOLEAN'
    );
  });

  it('negotiates only persistent NameID and exact MFA context', () => {
    const policy = `<p:NameIDPolicy Format="${SAML.persistent}" AllowCreate="false"/>`;
    expect(f.parse(f.requestXml('', policy)).allowCreate).toBe(false);
    expect(() =>
      f.parse(f.requestXml('', '<p:NameIDPolicy Format="email"/>'))
    ).toThrow('SAML_NAME_ID_POLICY');
    const context = `<p:RequestedAuthnContext Comparison="exact"><a:AuthnContextClassRef>${SAML.mfa}</a:AuthnContextClassRef></p:RequestedAuthnContext>`;
    expect(f.parse(f.requestXml('', context))).toBeDefined();
    expect(() =>
      f.parse(f.requestXml('', context.replace(SAML.mfa, 'password')))
    ).toThrow('SAML_AUTHN_CONTEXT');
    expect(() =>
      f.parse(f.requestXml('', context.replace('exact', 'minimum')))
    ).toThrow('SAML_AUTHN_CONTEXT');
  });

  it.each([
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
    '<!--comment-->',
    '<?evil x?>',
  ])('rejects declarations and parser ambiguity: %s', (prefix) => {
    expect(() => f.parse(prefix + f.requestXml())).toThrow(
      'SAML_XML_DECLARATION'
    );
  });

  it('rejects duplicate IDs, issuers, unsupported elements and malformed XML', () => {
    expect(() =>
      f.parse(f.requestXml('', '<p:NameIDPolicy ID="_request"/>'))
    ).toThrow('SAML_DUPLICATE_ID');
    expect(() =>
      f.parse(f.requestXml('', `<a:Issuer>${f.profile.entityId}</a:Issuer>`))
    ).toThrow('SAML_XML_STRUCTURE');
    expect(() => f.parse(f.requestXml('', '<p:Extensions/>'))).toThrow(
      'SAML_UNSUPPORTED_ELEMENT'
    );
    expect(() =>
      f.parse(f.requestXml().replace('</p:AuthnRequest>', '</other>'))
    ).toThrow();
  });

  it('rejects signed POST reference changes, tampering, and duplicate IDs', () => {
    const signed = signPostRequest(f);
    const profile = {
      ...f.profile,
      requestSigning: { mode: 'required', certificate: f.certificate },
    };
    expect(() =>
      f.parse(signed.replace('_request', '_changed'), 'post', [profile])
    ).toThrow('SAML_SIGNATURE_REFERENCE');
    expect(() =>
      f.parse(signed.replace('Version="2.0"', 'Version="1.0"'), 'post', [
        profile,
      ])
    ).toThrow(/signature/i);
    expect(() =>
      f.parse(
        signed.replace(
          '</p:AuthnRequest>',
          '<p:Extensions ID="_request"/></p:AuthnRequest>'
        ),
        'post',
        [profile]
      )
    ).toThrow('SAML_DUPLICATE_ID');
  });

  it('rejects duplicate parameters, unknown fields, oversized RelayState and invalid base64', () => {
    const parse = (rawQuery: string) =>
      parseAuthnRequest(
        { binding: 'redirect', rawQuery },
        { profiles: [f.profile], idp: f.idp, now: () => f.now }
      );
    expect(() => parse(`${f.form()}&SAMLRequest=eA==`)).toThrow(
      'SAML_PARAMETERS'
    );
    expect(() => parse(`${f.form()}&other=1`)).toThrow('SAML_PARAMETERS');
    expect(() =>
      parse(f.form().replace('opaque-handle', 'x'.repeat(81)))
    ).toThrow('SAML_RELAY_STATE');
    expect(() => parse('SAMLRequest=%%%')).toThrow('SAML_BASE64');
  });

  it('bounds compressed bytes, expanded bytes, document depth and total form size', () => {
    const parse = (encoded: string) =>
      parseAuthnRequest(
        {
          binding: 'redirect',
          rawQuery: new URLSearchParams({ SAMLRequest: encoded }).toString(),
        },
        { profiles: [f.profile], idp: f.idp, now: () => f.now }
      );
    expect(() => parse(Buffer.alloc(8193, 42).toString('base64'))).toThrow(
      'SAML_REQUEST_TOO_LARGE'
    );
    expect(() =>
      parse(
        deflateRawSync(Buffer.from('x'.repeat(1_000_000))).toString('base64')
      )
    ).toThrow('SAML_DECODE');
    expect(() =>
      f.parse(f.requestXml('', '<x>'.repeat(20) + '</x>'.repeat(20)))
    ).toThrow('SAML_XML_COMPLEXITY');
    expect(() => f.parse('x'.repeat(70_000), 'post')).toThrow(
      'SAML_FORM_TOO_LARGE'
    );
  });
});
