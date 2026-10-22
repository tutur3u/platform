import { beforeAll, describe, expect, it } from 'vitest';
import {
  certificateSchema,
  endpointSchema,
  identitySchema,
  spProfileSchema,
} from '../contracts';
import { createIdpMetadata } from '../saml/metadata';
import { createNodeSigner } from '../saml/node-signer';
import { createLoginResponse } from '../saml/response';
import { type Fixture, fixture } from './fixture';

let f: Fixture;
beforeAll(() => {
  f = fixture();
});

describe('issuance contract without application authorization', () => {
  it('requires fresh MFA for every account rather than trusting a boolean or enrolled factor', () => {
    expect(() =>
      f.response({
        assurance: { method: 'totp-mfa', authenticatedAt: f.now.toISOString() },
      })
    ).toThrow();
    const old = new Date(f.now.getTime() - 600_001).toISOString();
    expect(() =>
      f.response({
        assurance: { ...f.assurance, authenticatedAt: old, mfaVerifiedAt: old },
      })
    ).toThrow('SAML_FRESH_MFA_REQUIRED');
    const future = new Date(f.now.getTime() + 1).toISOString();
    expect(() =>
      f.response({ assurance: { ...f.assurance, mfaVerifiedAt: future } })
    ).toThrow('SAML_FRESH_MFA_REQUIRED');
  });

  it('requires a new primary authentication and MFA after ForceAuthn', () => {
    const prior = new Date(f.now.getTime() - 1000).toISOString();
    const request = { ...f.request, forceAuthn: true };
    expect(() =>
      f.response({
        request,
        assurance: { ...f.assurance, authenticatedAt: prior },
      })
    ).toThrow('SAML_FORCE_AUTHN_REQUIRED');
    expect(() => f.response({ request })).not.toThrow();
  });

  it('rejects expired requests, cross-client requests and changed registered ACS', () => {
    const issueInstant = new Date(f.now.getTime() - 300_001).toISOString();
    expect(() =>
      f.response({ request: { ...f.request, issueInstant } })
    ).toThrow('SAML_REQUEST_EXPIRED');
    expect(() =>
      f.response({ request: { ...f.request, issuer: 'urn:other' } })
    ).toThrow('SAML_REQUEST_PROFILE');
    expect(() =>
      f.response({
        profile: { ...f.profile, acsUrl: 'https://other.example.test/acs' },
      })
    ).toThrow('SAML_REQUEST_PROFILE');
    expect(() =>
      f.response({
        profile: {
          ...f.profile,
          requestSigning: { mode: 'required', certificate: f.certificate },
        },
      })
    ).toThrow('SAML_REQUEST_PROFILE');
  });

  it('rejects reused IDs from an injected generator', () => {
    expect(() =>
      createLoginResponse(
        {
          profile: f.profile,
          idp: f.idp,
          request: f.request,
          identity: f.identity,
          assurance: f.assurance,
        },
        {
          now: () => f.now,
          generateId: () => '_request',
          signer: f.signer,
        }
      )
    ).toThrow('SAML_ID_COLLISION');
  });

  it('refuses to return a response after the five-second issuance window', () => {
    let reads = 0;
    expect(() =>
      createLoginResponse(
        {
          profile: f.profile,
          idp: f.idp,
          request: f.request,
          identity: f.identity,
          assurance: f.assurance,
        },
        {
          now: () => new Date(f.now.getTime() + (reads++ ? 5001 : 0)),
          generateId: (() => {
            let n = 0;
            return () => `_id${++n}`;
          })(),
          signer: f.signer,
        }
      )
    ).toThrow('SAML_ISSUANCE_EXPIRED');
  });

  it('validates HTTPS endpoint configuration without normalizing requests into a match', () => {
    for (const url of [
      'http://sp.example.test/acs',
      'https://sp.example.test:444/acs',
      'https://user:password@sp.example.test/acs',
      'https://sp.example.test/acs#fragment',
      'https://sp.example.test/acs#',
      'https://*.example.test/acs',
      'https://SP.example.test/acs',
    ]) {
      expect(endpointSchema.safeParse(url).success).toBe(false);
    }
    expect(
      endpointSchema.safeParse('https://sp.example.test/acs').success
    ).toBe(true);
    expect(
      spProfileSchema.safeParse({ ...f.profile, nameIdFormat: 'email' }).success
    ).toBe(false);
  });

  it('rejects private/unapproved attributes and invalid XML characters at the input boundary', () => {
    expect(
      identitySchema.safeParse({ ...f.identity, groups: ['admin'] }).success
    ).toBe(false);
    expect(
      identitySchema.safeParse({ ...f.identity, firstName: 'bad\u0000name' })
        .success
    ).toBe(false);
    expect(
      identitySchema.safeParse({
        ...f.identity,
        pairwiseSubject: f.identity.email,
      }).success
    ).toBe(false);
  });

  it('checks RSA key/certificate association and certificate validity', () => {
    expect(
      certificateSchema.safeParse(f.certificate + f.certificate).success
    ).toBe(false);
    expect(() =>
      createNodeSigner({
        privateKey: fixture().privateKey,
        certificate: f.certificate,
      })
    ).toThrow('SAML_KEY_MISMATCH');
    expect(() =>
      createIdpMetadata(f.idp, () => new Date(f.now.getTime() + 172_800_000))
    ).toThrow('SAML_CERTIFICATE_EXPIRED');
  });
});
