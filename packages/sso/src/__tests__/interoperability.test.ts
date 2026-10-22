import { DOMParser } from '@xmldom/xmldom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SAML } from '../contracts';
import { createIdpMetadata } from '../saml/metadata';
import { type Fixture, fixture, resign, serviceProvider } from './fixture';

let f: Fixture;
beforeAll(() => {
  f = fixture();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('real signed IdP response to independent Node-SAML SP', () => {
  it('accepts both signatures, pairwise NameID, four attributes and escaped names', async () => {
    const result = f.response();
    const sp = await serviceProvider(f);
    const profile = await sp.accept(result.xml);
    expect(profile.nameID).toBe(f.identity.pairwiseSubject);
    expect(profile.nameIDFormat).toBe(SAML.persistent);
    expect(profile.attributes).toEqual({
      id: f.identity.pairwiseSubject,
      email: f.identity.email,
      firstName: f.identity.firstName,
      lastName: f.identity.lastName,
    });
    expect(profile.inResponseTo).toBe(f.request.id);
    const doc = new DOMParser().parseFromString(result.xml, 'application/xml');
    expect(
      doc.getElementsByTagNameNS(SAML.signature, 'Signature')
    ).toHaveLength(2);
    expect(
      Array.from(
        doc.getElementsByTagNameNS(SAML.signature, 'SignatureMethod')
      ).map((e) => e.getAttribute('Algorithm'))
    ).toEqual([SAML.rsaSha256, SAML.rsaSha256]);
    expect(
      Array.from(
        doc.getElementsByTagNameNS(SAML.signature, 'CanonicalizationMethod')
      ).map((e) => e.getAttribute('Algorithm'))
    ).toEqual([SAML.exclusive, SAML.exclusive]);
    expect(
      doc.getElementsByTagNameNS(SAML.assertion, 'AuthnContextClassRef')[0]
        ?.textContent
    ).toBe(SAML.mfa);
    expect(result.destination).toBe(f.profile.acsUrl);
    expect(result.relayState).toBe('opaque-handle');
    expect(Date.parse(result.expiresAt) - f.now.getTime()).toBe(120_000);
  });

  it.each(['text ]]> suffix', 'Supplementary \u{1f680}', '<tag>& "quoted"'])(
    'round-trips XML-sensitive and Unicode names: %s',
    async (firstName) => {
      const result = f.response({ identity: { ...f.identity, firstName } });
      const profile = await (await serviceProvider(f)).accept(result.xml);
      expect(profile.attributes).toMatchObject({ firstName });
      expect(profile.nameID).toBe(f.identity.pairwiseSubject);
    }
  );

  it('keeps a caller-allocated pairwise subject stable across email changes', async () => {
    const one = f.response();
    const two = f.response({
      identity: { ...f.identity, email: 'changed@example.test' },
    });
    expect((await (await serviceProvider(f)).accept(one.xml)).nameID).toBe(
      (await (await serviceProvider(f)).accept(two.xml)).nameID
    );
    expect(one.assertionId).not.toBe(two.assertionId);
  });

  it('rejects a replayed InResponseTo through the actual SP request cache', async () => {
    const sp = await serviceProvider(f);
    const { xml } = f.response();
    await sp.accept(xml);
    await expect(sp.accept(xml)).rejects.toThrow(/InResponseTo/);
  });

  it('rejects a tampered attribute', async () => {
    await expect(
      (await serviceProvider(f)).accept(
        f
          .response()
          .xml.replace('invited@example.test', 'attacker@example.test')
      )
    ).rejects.toThrow(/signature/i);
  });

  it('rejects an unsigned assertion even inside a valid signed response', async () => {
    const xml = resign(f, f.response().xml, () => {}, false);
    await expect((await serviceProvider(f)).accept(xml)).rejects.toThrow(
      /signature/i
    );
  });

  it('rejects wrong audience with valid signatures', async () => {
    const xml = resign(f, f.response().xml, (doc) => {
      const audience = doc.getElementsByTagNameNS(
        SAML.assertion,
        'Audience'
      )[0];
      if (audience) audience.textContent = 'urn:attacker';
    });
    await expect((await serviceProvider(f)).accept(xml)).rejects.toThrow(
      /audience/i
    );
  });

  it.each(['Destination', 'Recipient'])(
    'rejects wrong %s with valid signatures',
    async (attribute) => {
      const xml = resign(f, f.response().xml, (doc) => {
        const element =
          attribute === 'Destination'
            ? doc.documentElement
            : doc.getElementsByTagNameNS(
                SAML.assertion,
                'SubjectConfirmationData'
              )[0];
        element?.setAttribute(attribute, 'https://attacker.example.test/acs');
      });
      await expect((await serviceProvider(f)).accept(xml)).rejects.toThrow(
        'SP_ACS_MISMATCH'
      );
    }
  );

  it('rejects expired NotOnOrAfter at its exclusive boundary', async () => {
    const result = f.response();
    const sp = await serviceProvider(f);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(result.expiresAt));
    await expect(sp.accept(result.xml)).rejects.toThrow(
      /expired|confirmation/i
    );
  });

  it('rejects mismatched bearer InResponseTo with valid signatures', async () => {
    const xml = resign(f, f.response().xml, (doc) => {
      doc
        .getElementsByTagNameNS(SAML.assertion, 'SubjectConfirmationData')[0]
        ?.setAttribute('InResponseTo', '_other');
    });
    await expect((await serviceProvider(f)).accept(xml)).rejects.toThrow(
      /InResponseTo/
    );
  });

  it('rejects a duplicated signed assertion with a duplicate ID and broken outer digest', async () => {
    const doc = new DOMParser().parseFromString(
      f.response().xml,
      'application/xml'
    );
    assert.ok(doc.documentElement);
    const assertion = doc.getElementsByTagNameNS(
      SAML.assertion,
      'Assertion'
    )[0];
    if (!assertion) throw new Error('missing assertion');
    const forged = assertion.cloneNode(true);
    doc.documentElement.insertBefore(forged, assertion);
    await expect(
      (await serviceProvider(f)).accept(doc.toString())
    ).rejects.toThrow(/signature/i);
  });

  it('rejects a key that is not the configured trust anchor', async () => {
    const wrong = fixture();
    await expect(
      (await serviceProvider(f)).accept(wrong.response().xml)
    ).rejects.toThrow(/signature/i);
  });

  it('emits public metadata with both request bindings and no SLO', () => {
    const xml = createIdpMetadata(f.idp, () => f.now);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    assert.ok(doc.documentElement);
    expect(doc.documentElement.getAttribute('entityID')).toBe(f.idp.entityId);
    expect(
      doc.getElementsByTagNameNS(SAML.metadata, 'SingleLogoutService')
    ).toHaveLength(0);
    expect(
      Array.from(
        doc.getElementsByTagNameNS(SAML.metadata, 'SingleSignOnService')
      ).map((e) => e.getAttribute('Binding'))
    ).toEqual([SAML.redirect, SAML.post]);
    expect(xml).not.toContain('PRIVATE');
    expect(
      doc.getElementsByTagNameNS(SAML.signature, 'X509Certificate')[0]
        ?.textContent
    ).toBe(f.certificate.replace(/-----[^-]+-----|\s/g, ''));
  });
});

import assert from 'node:assert/strict';
