import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { appleAppStorePinnedRoots } from './apple-root-certificates';
import { createAppleServerVerifier } from './apple-server-verifier';

describe('official Apple cryptographic verifier, without a mocked verifier', () => {
  it('rejects forged evidence even when its header names the pinned Apple root', async () => {
    const roots = appleAppStorePinnedRoots();
    const root = Buffer.from(roots[0].der).toString('base64');
    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', x5c: [root, root, root] })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        bundleId: 'com.tuturuuu.app.mobile',
        environment: 'Sandbox',
        productId: 'com.tuturuuu.app.mobile.plus.monthly',
      })
    ).toString('base64url');
    const signature = Buffer.alloc(64).toString('base64url');
    const verifier = createAppleServerVerifier({
      pinnedRoots: roots,
      environment: 'Sandbox',
      bundleId: 'com.tuturuuu.app.mobile',
      appAppleId: 123,
      productIds: ['com.tuturuuu.app.mobile.plus.monthly'],
    });

    expect(
      await verifier.verifyPurchase({
        signedTransaction: `${header}.${payload}.${signature}`,
        actorId: '00000000-0000-4000-8000-000000000001',
        expectedAppAccountToken: '00000000-0000-4000-8000-000000000002',
      })
    ).toEqual({ kind: 'rejected', category: 'verification_failed' });
  });
});
