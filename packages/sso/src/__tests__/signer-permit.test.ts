import { describe, expect, it } from 'vitest';
import { canonicalJson, fieldsHash, permitMessage } from '../signer-permit';

// Known answers computed with an independent JCS-style implementation
// (sorted keys, raw UTF-8 strings, minimal separators), so any issuer that
// reproduces them interoperates with the signer Worker.
const FIELDS = {
  client: '00000000-0000-4000-8000-00000000c11e',
  protocol: 'saml',
  transactionId: '00000000-0000-4000-8000-0000000000a1',
  kid: 'saml-test-1',
  subject: '00000000-0000-4000-8000-0000000000b2',
  attributes: {
    email: 'an@example.test',
    firstName: 'Nguyễn "Ân"',
    lastName: 'Đặng 🚀',
  },
  profile: {
    entityId: 'urn:example:sp',
    acsUrl: 'https://sp.example.test/acs',
  },
  idp: {
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
  },
  request: {
    id: '_request',
    issueInstant: '2026-11-24T00:00:00.000Z',
    forceAuthn: false,
    relayState: 'opaque' as string | undefined,
  },
  assurance: {
    authenticatedAt: '2026-11-24T00:00:00.000Z',
    mfaVerifiedAt: '2026-11-24T00:00:01.000Z',
  },
  notOnOrAfter: '2026-11-24T00:02:00.000Z',
};

const withRelay = (relayState: string | undefined) => ({
  ...FIELDS,
  request: { ...FIELDS.request, relayState },
});

describe('signer permit wire form', () => {
  it('sorts keys at every depth and keeps non-ASCII text raw', () => {
    expect(canonicalJson(FIELDS)).toBe(
      '{"assurance":{"authenticatedAt":"2026-11-24T00:00:00.000Z","mfaVerifiedAt":"2026-11-24T00:00:01.000Z"},"attributes":{"email":"an@example.test","firstName":"Nguyễn \\"Ân\\"","lastName":"Đặng 🚀"},"client":"00000000-0000-4000-8000-00000000c11e","idp":{"entityId":"https://idp.example.test/metadata","ssoUrl":"https://idp.example.test/sso"},"kid":"saml-test-1","notOnOrAfter":"2026-11-24T00:02:00.000Z","profile":{"acsUrl":"https://sp.example.test/acs","entityId":"urn:example:sp"},"protocol":"saml","request":{"forceAuthn":false,"id":"_request","issueInstant":"2026-11-24T00:00:00.000Z","relayState":"opaque"},"subject":"00000000-0000-4000-8000-0000000000b2","transactionId":"00000000-0000-4000-8000-0000000000a1"}'
    );
    expect(canonicalJson({ b: 1, a: { d: true, c: 'x' } })).toBe(
      '{"a":{"c":"x","d":true},"b":1}'
    );
  });

  it('pins the field hash with the relay state present, absent and empty', async () => {
    expect(await fieldsHash(FIELDS)).toBe(
      'SL6qO8xio_sfQbV47ky1RvwSNfQTj5Dj31_OGm9hV6E'
    );
    expect(await fieldsHash(withRelay(undefined))).toBe(
      'l5x-M7cGInsBR0bR2keuWJiFVGMSEQwDXkeEGTYFDA0'
    );
    expect(await fieldsHash(withRelay(''))).toBe(
      'T2U9fw0WCtd7Be4r_AR0ssiYus9lxcdMFn_xiJ6Lqxg'
    );
    expect(await fieldsHash({ b: 1, a: { d: true, c: 'x' } })).toBe(
      'XTZayFoQR6UsmuPMMF40vNLAmk3A2gW7ZW-HKWDfyXE'
    );
  });

  it('does not depend on member insertion order', async () => {
    const reversed = Object.fromEntries(Object.entries(FIELDS).reverse());
    expect(await fieldsHash(reversed)).toBe(await fieldsHash(FIELDS));
  });

  it('refuses values outside the portable domain', () => {
    for (const value of [
      { a: [1] },
      { a: 1.5 },
      { a: null },
      { a: '\ud800' },
      { 'a-b': 'x' },
      { é: 'x' },
    ]) {
      expect(() => canonicalJson(value)).toThrow(TypeError);
    }
  });

  it('frames the signed claims in a fixed order', () => {
    expect(
      new TextDecoder().decode(
        permitMessage({
          v: 1,
          id: 'p',
          kid: 'k',
          iat: 1,
          exp: 2,
          fields: 'f',
        })
      )
    ).toBe('ttr-sso-permit-v1\n[1,"p","k",1,2,"f"]');
  });
});
