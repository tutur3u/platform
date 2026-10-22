import assert from 'node:assert/strict';
import type { Element } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { SAML, samlIdSchema } from '../contracts';
import { parseAuthnRequest } from '../saml/request';
import { children, documentRoot, one, parseXml, serialize } from '../saml/xml';
import {
  type Fixture,
  fixture,
  serviceProvider,
  signPostRequest,
} from './fixture';

let f: Fixture;
beforeAll(() => {
  f = fixture();
});

function expectPublicCode(run: () => unknown, code: string) {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof Error);
  expect(error.message).toBe(code);
  expect(String(error)).toBe(`Error: ${code}`);
  expect(error.cause).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain('attacker-diagnostic');
}

function verifySignedElement(element: Element, xml = serialize(element)) {
  const verifier = new SignedXml({
    publicCert: f.certificate,
    getCertFromKeyInfo: () => null,
  });
  verifier.loadSignature(serialize(one(element, SAML.signature, 'Signature')));
  expect(verifier.checkSignature(xml)).toBe(true);
  const references = verifier.getSignedReferences();
  expect(references).toHaveLength(1);
  assert.ok(references[0]);
  const authenticated = documentRoot(parseXml(references[0]));
  expect(authenticated.getAttribute('ID')).toBe(element.getAttribute('ID'));
  return authenticated;
}

describe('security review protocol regressions', () => {
  describe.each(['redirect', 'post'] as const)('%s AllowCreate', (binding) => {
    it.each([
      ['', false],
      [`<p:NameIDPolicy Format="${SAML.persistent}"/>`, false],
      ...['false', '0', 'true', '1'].map(
        (value) =>
          [
            `<p:NameIDPolicy Format="${SAML.persistent}" AllowCreate="${value}"/>`,
            value === 'true' || value === '1',
          ] as const
      ),
    ] as const)('requires explicit permission: %s', (policy, expected) => {
      expect(f.parse(f.requestXml('', policy), binding).allowCreate).toBe(
        expected
      );
    });

    it.each(['', 'TRUE', 'yes', '2', ' false '])(
      'rejects invalid AllowCreate=%s',
      (value) => {
        expectPublicCode(
          () =>
            f.parse(
              f.requestXml(
                '',
                `<p:NameIDPolicy Format="${SAML.persistent}" AllowCreate="${value}"/>`
              ),
              binding
            ),
          'SAML_BOOLEAN'
        );
      }
    );

    it.each(['', `<p:NameIDPolicy Format="${SAML.persistent}"/>`])(
      'denies allocation for authenticated omission: %s',
      (policy) => {
        const xml = f.requestXml('', policy);
        const profile = {
          ...f.profile,
          requestSigning: { mode: 'required', certificate: f.certificate },
        };
        const request =
          binding === 'post'
            ? f.parse(signPostRequest(f, xml), binding, [profile])
            : parseAuthnRequest(
                { binding, rawQuery: f.signedRedirect(xml) },
                { idp: f.idp, profiles: [profile], now: () => f.now }
              );
        expect(request).toMatchObject({
          allowCreate: false,
          provenance: 'signed',
        });
      }
    );
  });

  it.each([
    '<attacker-diagnostic>',
    '<attacker-diagnostic>&unknown;</attacker-diagnostic>',
    '<attacker-diagnostic/><second/>',
    '<attacker-diagnostic a="1" a="2"/>',
  ])('sanitizes malformed XML: %s', (xml) => {
    expectPublicCode(() => f.parse(xml, 'post'), 'SAML_XML_INVALID');
  });

  it.each(['DigestValue', 'SignatureValue'])(
    'sanitizes missing POST %s library diagnostics',
    (name) => {
      const signed = documentRoot(parseXml(signPostRequest(f)));
      const value = signed.getElementsByTagNameNS(SAML.signature, name)[0];
      assert.ok(value);
      value.parentNode?.removeChild(value);
      expectPublicCode(
        () =>
          f.parse(serialize(signed), 'post', [
            {
              ...f.profile,
              requestSigning: { mode: 'required', certificate: f.certificate },
            },
          ]),
        'SAML_INVALID_SIGNATURE'
      );
    }
  );

  it.each(['DigestValue', 'SignatureValue'])(
    'sanitizes invalid POST %s instead of exposing attacker bytes',
    (name) => {
      const signed = documentRoot(parseXml(signPostRequest(f)));
      const value = signed.getElementsByTagNameNS(SAML.signature, name)[0];
      assert.ok(value);
      value.textContent = 'attacker-diagnostic';
      expectPublicCode(
        () =>
          f.parse(serialize(signed), 'post', [
            {
              ...f.profile,
              requestSigning: { mode: 'required', certificate: f.certificate },
            },
          ]),
        'SAML_INVALID_SIGNATURE'
      );
    }
  );

  it('rejects a valid signature referencing a distinct nested request', () => {
    const nested = f.requestXml().replace('ID="_request"', 'ID="_nested"');
    const outer = f.requestXml('', `<p:Extensions>${nested}</p:Extensions>`);
    const xml = signPostRequest(f, outer, "//*[@ID='_nested']");
    const root = documentRoot(parseXml(xml));
    const verifier = new SignedXml({
      publicCert: f.certificate,
      getCertFromKeyInfo: () => null,
    });
    verifier.loadSignature(serialize(one(root, SAML.signature, 'Signature')));
    expect(verifier.checkSignature(xml)).toBe(true);
    expect(
      documentRoot(
        parseXml(verifier.getSignedReferences()[0] ?? '')
      ).getAttribute('ID')
    ).toBe('_nested');
    expectPublicCode(
      () =>
        f.parse(xml, 'post', [
          {
            ...f.profile,
            requestSigning: { mode: 'required', certificate: f.certificate },
          },
        ]),
      'SAML_SIGNATURE_REFERENCE'
    );
  });

  it('rejects a distinct unsigned attacker assertion beside an intact signed assertion and valid outer signature', async () => {
    const original = f.response();
    const doc = parseXml(original.xml);
    const root = documentRoot(doc);
    const signed = one(root, SAML.assertion, 'Assertion');
    const signedBefore = serialize(signed);
    const attacker = doc.importNode(signed, true);
    attacker.setAttribute('ID', '_attacker');
    const attackerSignature = one(attacker, SAML.signature, 'Signature');
    attacker.removeChild(attackerSignature);
    const attackerName = attacker.getElementsByTagNameNS(
      SAML.assertion,
      'NameID'
    )[0];
    const attackerEmail = attacker.getElementsByTagNameNS(
      SAML.assertion,
      'AttributeValue'
    )[1];
    assert.ok(attackerName && attackerEmail);
    attackerName.textContent = 'attacker-subject';
    attackerEmail.textContent = 'attacker@example.test';
    root.insertBefore(attacker, signed);
    root.removeChild(one(root, SAML.signature, 'Signature'));
    const xml = f.signer({
      xml: serialize(doc),
      id: samlIdSchema.parse(root.getAttribute('ID')),
      kind: 'Response',
    });
    const wrapped = documentRoot(parseXml(xml));
    const assertions = children(wrapped).filter(
      (e) => e.namespaceURI === SAML.assertion && e.localName === 'Assertion'
    );
    const [unsigned, intact] = assertions;
    assert.ok(unsigned && intact);
    expect(unsigned.getAttribute('ID')).toBe('_attacker');
    expect(
      unsigned.getElementsByTagNameNS(SAML.signature, 'Signature')
    ).toHaveLength(0);
    expect(
      unsigned.getElementsByTagNameNS(SAML.assertion, 'NameID')[0]?.textContent
    ).toBe('attacker-subject');
    expect(serialize(intact)).toBe(signedBefore);
    expect(
      verifySignedElement(intact).getElementsByTagNameNS(
        SAML.assertion,
        'NameID'
      )[0]?.textContent
    ).toBe(f.identity.pairwiseSubject);
    verifySignedElement(wrapped);
    const direct = await serviceProvider(f);
    await expect(
      direct.sp.validatePostResponseAsync({
        SAMLResponse: Buffer.from(xml).toString('base64'),
      })
    ).rejects.toThrow('Invalid signature: multiple assertions');
    await expect((await serviceProvider(f)).accept(xml)).rejects.toThrow(
      'Invalid signature: multiple assertions'
    );
  });
});
