import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMastermindHandoffIssuerProof,
  createMastermindLoginTransaction,
  MASTERMIND_APEX_CALLBACK,
  MASTERMIND_HOST_CALLBACK,
  MASTERMIND_LOGIN_TRANSACTION_PARAM,
  mastermindCallbackOf,
  verifyMastermindHandoffIssuerProof,
  verifyMastermindLoginTransaction,
} from './app-redeem-proof';

const SECRET = 'mastermind-test-signing-key'.repeat(2);
const NOW = 1_795_000_000;
const CHALLENGE = 'c'.repeat(43);

function signed(callback: string) {
  const url = new URL(callback);
  url.searchParams.set(
    MASTERMIND_LOGIN_TRANSACTION_PARAM,
    createMastermindLoginTransaction(url, CHALLENGE, false, SECRET, NOW * 1000)
  );
  return url.href;
}

describe('Mastermind exact callbacks', () => {
  beforeEach(() => vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it('recognizes only the two exact callback endpoints', () => {
    for (const endpoint of [
      MASTERMIND_HOST_CALLBACK,
      MASTERMIND_APEX_CALLBACK,
    ]) {
      expect(mastermindCallbackOf(`${endpoint}?nextUrl=%2F`)).toBe(endpoint);
    }
    for (const url of [
      'https://tuturuuu.com/verify-token',
      'https://tuturuuu.com/mastermind/verify-token/',
      'https://tuturuuu.com/en/mastermind/verify-token',
      'http://tuturuuu.com/mastermind/verify-token',
      'not a url',
    ]) {
      expect(mastermindCallbackOf(url)).toBeNull();
    }
  });

  it('verifies an apex transaction only when the caller admits the apex', () => {
    const apex = signed(`${MASTERMIND_APEX_CALLBACK}?nextUrl=%2Fship`);
    expect(verifyMastermindLoginTransaction(apex, NOW)).toBeNull();
    expect(
      verifyMastermindLoginTransaction(apex, NOW, { apex: true })
    ).toMatchObject({
      callback: `${MASTERMIND_APEX_CALLBACK}?nextUrl=%2Fship`,
      endpoint: MASTERMIND_APEX_CALLBACK,
    });
    const host = signed(`${MASTERMIND_HOST_CALLBACK}?nextUrl=%2Fship`);
    expect(verifyMastermindLoginTransaction(host, NOW)).toMatchObject({
      endpoint: MASTERMIND_HOST_CALLBACK,
    });
  });

  it('a transaction signed for one callback never verifies for the other', () => {
    const apex = new URL(signed(`${MASTERMIND_APEX_CALLBACK}?nextUrl=%2F`));
    const moved = new URL(`${MASTERMIND_HOST_CALLBACK}${apex.search}`);
    expect(verifyMastermindLoginTransaction(moved.href, NOW)).toBeNull();
    const host = new URL(signed(`${MASTERMIND_HOST_CALLBACK}?nextUrl=%2F`));
    const lifted = new URL(`${MASTERMIND_APEX_CALLBACK}${host.search}`);
    expect(
      verifyMastermindLoginTransaction(lifted.href, NOW, { apex: true })
    ).toBeNull();
  });

  it('binds a v2 issuer proof to its exact callback', () => {
    for (const [issued, other] of [
      [MASTERMIND_HOST_CALLBACK, MASTERMIND_APEX_CALLBACK],
      [MASTERMIND_APEX_CALLBACK, MASTERMIND_HOST_CALLBACK],
    ] as const) {
      const proof = createMastermindHandoffIssuerProof('tok', issued);
      expect(proof.startsWith('v2.')).toBe(true);
      const check = (callback: string | undefined, token = 'tok') =>
        verifyMastermindHandoffIssuerProof(token, proof, {
          acceptV1: true,
          callback,
        });
      expect(check(issued)).toBe(true);
      expect(check(other)).toBe(false);
      expect(check(undefined)).toBe(false);
      expect(check(issued, 'other-token')).toBe(false);
    }
  });

  it('accepts a v1 proof only for the host and only while allowed', () => {
    const v1 = createMastermindHandoffIssuerProof('tok');
    const check = (acceptV1: boolean, callback?: string) =>
      verifyMastermindHandoffIssuerProof('tok', v1, { acceptV1, callback });
    expect(check(true)).toBe(true);
    expect(check(true, MASTERMIND_HOST_CALLBACK)).toBe(true);
    expect(check(true, MASTERMIND_APEX_CALLBACK)).toBe(false);
    expect(check(false)).toBe(false);
    expect(check(false, MASTERMIND_HOST_CALLBACK)).toBe(false);
  });
});
