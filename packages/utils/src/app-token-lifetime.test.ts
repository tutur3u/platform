import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';
import {
  createSignedAccessToken,
  verifySignedAccessToken,
} from './signed-access-token';

// Fixed in CI and locally; fast-check reports seed/path when shrinking fails.
const properties = { seed: 20261026, numRuns: 250 };
const secret = 'property-test-only-token-secret';
const instant = fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_999 });
const ttl = fc.integer({ min: 1, max: 8 * 60 * 60 });

describe('cross-app token lifetime guarantees on main', () => {
  // #6840's database handoff lifetime caps are a separate token contract.
  it('defaults coordination tokens to eight hours from the floored issue second', () => {
    fc.assert(
      fc.property(instant, (milliseconds) => {
        const created = createAppCoordinationToken(
          { targetApp: 'finance', userId: 'property-test-user' },
          { now: new Date(milliseconds), secret }
        );
        expect(created.claims.iat).toBe(Math.floor(milliseconds / 1000));
        expect(created.claims.exp - created.claims.iat).toBe(8 * 60 * 60);
        expect(new Date(created.expiresAt).getTime()).toBe(
          created.claims.exp * 1000
        );
      }),
      properties
    );
  });

  it('accepts before expiry and rejects at or after expiry for both token helpers', () => {
    fc.assert(
      fc.property(
        instant,
        ttl,
        fc.nat({ max: 86_400_000 }),
        (milliseconds, lifetime, elapsed) => {
          const options = { now: new Date(milliseconds), secret };
          const coordination = createAppCoordinationToken(
            {
              targetApp: 'finance',
              userId: 'property-test-user',
              expiresInSeconds: lifetime,
            },
            options
          );
          const signed = createSignedAccessToken(
            'test:finance',
            {},
            lifetime,
            options
          );
          const expires = (Math.floor(milliseconds / 1000) + lifetime) * 1000;
          expect(coordination.claims.exp * 1000).toBe(expires);
          expect(signed.claims.exp * 1000).toBe(expires);
          expect(new Date(signed.expiresAt).getTime()).toBe(expires);
          const before = { now: new Date(expires - 1), secret };
          expect(
            verifyAppCoordinationToken(coordination.token, before).ok
          ).toBe(true);
          expect(
            verifySignedAccessToken('test:finance', signed.token, before)
          ).toEqual(signed.claims);
          for (const now of [expires, expires + elapsed]) {
            const atOrAfter = { now: new Date(now), secret };
            expect(
              verifyAppCoordinationToken(coordination.token, atOrAfter)
            ).toEqual({ ok: false, error: 'Token expired' });
            expect(
              verifySignedAccessToken('test:finance', signed.token, atOrAfter)
            ).toBeNull();
          }
        }
      ),
      properties
    );
  });

  it('rejects non-positive and fractional signed-access TTLs', () => {
    const invalidTtl = fc.oneof(
      fc.integer({ min: -1_000_000, max: 0 }),
      fc.double({ min: 0.01, max: 0.99, noNaN: true }),
      fc.constantFrom(Number.NaN, Infinity, -Infinity)
    );
    fc.assert(
      fc.property(invalidTtl, (lifetime) => {
        expect(() =>
          createSignedAccessToken('test:finance', {}, lifetime, { secret })
        ).toThrow('positive integer');
      }),
      properties
    );
  });

  it('does not let caller-supplied signed claims override the requested lifetime', () => {
    fc.assert(
      fc.property(
        instant,
        ttl,
        fc.integer(),
        fc.integer(),
        (milliseconds, lifetime, iat, exp) => {
          const created = createSignedAccessToken(
            'test:finance',
            { iat, exp, pur: 'other:purpose' },
            lifetime,
            { now: new Date(milliseconds), secret }
          );
          expect(created.claims.iat).toBe(Math.floor(milliseconds / 1000));
          expect(created.claims.exp - created.claims.iat).toBe(lifetime);
          expect(created.claims.pur).toBe('test:finance');
        }
      ),
      properties
    );
  });

  it('rejects correctly signed coordination claims with nonnumeric temporal fields', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('iat', 'exp'),
        fc.oneof(
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer())
        ),
        (field, invalid) => {
          const options = { now: new Date(1_800_000_000_000), secret };
          const created = createAppCoordinationToken(
            { targetApp: 'finance', userId: 'property-test-user' },
            options
          );
          // Use the actual header, retaining the existing wire/signature protocol.
          const encodedHeader = created.token
            .slice('ttr_app_'.length)
            .split('.')[0];
          const payload = Buffer.from(
            JSON.stringify({ ...created.claims, [field]: invalid })
          ).toString('base64url');
          const unsigned = `${encodedHeader}.${payload}`;
          const signature = createHmac('sha256', secret)
            .update(unsigned)
            .digest('base64url');
          expect(
            verifyAppCoordinationToken(
              `ttr_app_${unsigned}.${signature}`,
              options
            )
          ).toEqual({ ok: false, error: 'Invalid token claims' });
        }
      ),
      properties
    );
  });
});
