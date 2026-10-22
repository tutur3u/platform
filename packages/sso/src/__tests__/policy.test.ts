import { describe, expect, it } from 'vitest';
import { SAML, validatedRequestSchema } from '../contracts';
import { authorizeIdentity } from '../issuance/policy';

const now = new Date('2026-10-22T10:00:00Z');

import { actor, policy } from './issuance-fixture';

const request = validatedRequestSchema.parse({
  id: '_request',
  issuer: 'urn:example:sp',
  destination: 'https://idp.example.test/sso',
  acsUrl: 'https://sp.example.test/acs',
  issueInstant: now.toISOString(),
  forceAuthn: false,
  nameIdFormat: SAML.persistent,
  allowCreate: false,
  binding: 'redirect',
  provenance: 'unsigned',
});

describe('identity authorization intersection', () => {
  it.each(['unassigned', 'guest', 'removed member'])(
    'denies %s',
    (scenario) => {
      const rejected = {
        ...policy,
        ...(scenario === 'unassigned'
          ? { assigned: false }
          : { member: false }),
      };
      expect(() =>
        authorizeIdentity({ policy: rejected, principal: actor, request, now })
      ).toThrow();
    }
  );
  it.each([
    { emailConfirmed: false },
    { accountAllowed: false },
    { email: 'other@evil.test' },
    { email: 'member@sub.example.test' },
    { factorCurrent: false },
    { mfaAt: now.getTime() / 1000 - 601 },
    { mfaAt: now.getTime() / 1000 + 1 },
    { primaryAt: now.getTime() / 1000 },
  ])('denies invalid identity/proof %j', (change) => {
    expect(() =>
      authorizeIdentity({
        policy,
        principal: { ...actor, ...change },
        request,
        now,
      })
    ).toThrow();
  });
  it('accepts the inclusive ten-minute MFA boundary', () => {
    expect(
      authorizeIdentity({
        policy,
        principal: {
          ...actor,
          primaryAt: actor.mfaAt - 700,
          mfaAt: now.getTime() / 1000 - 600,
        },
        request,
        now,
      }).email
    ).toBe(actor.email);
  });
  it('ForceAuthn rejects pre-request authentication', () => {
    expect(() =>
      authorizeIdentity({
        policy,
        principal: actor,
        request: { ...request, forceAuthn: true },
        now,
      })
    ).toThrow();
  });
  it('returns only explicitly shared identity and assurance', () => {
    expect(
      Object.keys(
        authorizeIdentity({ policy, principal: actor, request, now })
      ).sort()
    ).toEqual(['assurance', 'email', 'firstName', 'lastName']);
  });
});
