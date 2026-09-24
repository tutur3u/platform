// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';
import { createMfaTransfer, readMfaTransfer } from '../required-mfa-transfer';

const proof = {
  sessionId: 'session',
  verifiedAt: Math.floor(Date.now() / 1000) - 5,
};
beforeEach(() =>
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-transfer-secret')
);
describe('MFA proof transfer through caller-controlled metadata', () => {
  it('accepts only a signed proof for the exact user and target', () => {
    const token = createMfaTransfer('actor', 'mail', proof);
    expect(readMfaTransfer(token, 'actor', 'mail')).toEqual(proof);
    expect(readMfaTransfer(token, 'victim', 'mail')).toBeNull();
    expect(readMfaTransfer(token, 'actor', 'infra')).toBeNull();
  });
  it('rejects raw metadata and tokens without the transfer scope', () => {
    expect(readMfaTransfer(proof, 'actor', 'mail')).toBeNull();
    const token = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'mail',
      mfa: proof,
    }).token;
    expect(readMfaTransfer(token, 'actor', 'mail')).toBeNull();
  });
});
