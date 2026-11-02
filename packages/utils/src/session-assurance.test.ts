import { describe, expect, it } from 'vitest';
import {
  createAppCoordinationToken,
  createSessionAssuranceTransferToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';
import { createMfaTransfer } from './required-mfa-transfer';
import { sessionAssuranceFromVerifiedClaims } from './session-assurance';
import {
  createSessionAssuranceTransfer,
  readSessionAssuranceTransfer,
} from './session-assurance-transfer';

describe('session assurance', () => {
  it('derives aal and method names from verified Supabase claims', () => {
    expect(
      sessionAssuranceFromVerifiedClaims({
        aal: 'aal2',
        amr: [
          { method: 'totp', timestamp: 20 },
          { method: 'password', timestamp: 10 },
          { method: 'totp', timestamp: 30 },
          { method: 'Bad Method', timestamp: 1 },
          'otp',
          null,
        ],
      })
    ).toEqual({ aal: 'aal2', amr: ['totp', 'password', 'otp'] });
    expect(sessionAssuranceFromVerifiedClaims({ aal: 'aal1' })).toEqual({
      aal: 'aal1',
    });
    expect(sessionAssuranceFromVerifiedClaims({ aal: 'aal3' })).toBeNull();
    expect(sessionAssuranceFromVerifiedClaims({})).toBeNull();
    expect(sessionAssuranceFromVerifiedClaims(null)).toBeNull();
  });

  it('binds the transfer to the user and target app', () => {
    const transfer = createSessionAssuranceTransfer('user-1', 'fysh', {
      aal: 'aal2',
      amr: ['password', 'totp'],
    });
    expect(readSessionAssuranceTransfer(transfer, 'user-1', 'fysh')).toEqual({
      aal: 'aal2',
      amr: ['password', 'totp'],
    });
    expect(readSessionAssuranceTransfer(transfer, 'user-2', 'fysh')).toBeNull();
    expect(
      readSessionAssuranceTransfer(transfer, 'user-1', 'other')
    ).toBeNull();
    expect(createSessionAssuranceTransfer('user-1', 'fysh', null)).toBe(
      undefined
    );
  });

  it('refuses unsigned, foreign-secret or wrong-purpose transfers', () => {
    const forged = createSessionAssuranceTransferToken(
      {
        aal: 'aal2',
        scopes: ['assurance:transfer'],
        targetApp: 'fysh',
        userId: 'user-1',
      },
      { secret: 'attacker-secret' }
    ).token;
    const mfaOnly = createMfaTransfer('user-1', 'fysh', {
      sessionId: 'session-1',
      verifiedAt: 1,
    });
    const refreshScoped = createAppCoordinationToken({
      aal: 'aal2',
      scopes: ['app-token:refresh'],
      targetApp: 'fysh',
      userId: 'user-1',
    }).token;
    for (const value of [
      forged,
      mfaOnly,
      refreshScoped,
      'aal2',
      { aal: 'aal2' },
    ]) {
      expect(readSessionAssuranceTransfer(value, 'user-1', 'fysh')).toBeNull();
    }
  });

  it('validates assurance claims on app-coordination tokens', () => {
    const token = createAppCoordinationToken({
      aal: 'aal1',
      amr: ['password'],
      targetApp: 'fysh',
      userId: 'user-1',
    });
    expect(token.claims).toMatchObject({ aal: 'aal1', amr: ['password'] });
    const verified = verifyAppCoordinationToken(token.token);
    expect(verified.ok && verified.claims.aal).toBe('aal1');
    expect(
      createAppCoordinationToken({ targetApp: 'fysh', userId: 'user-1' }).claims
    ).not.toHaveProperty('aal');
    expect(() =>
      createAppCoordinationToken({
        aal: 'aal3' as 'aal2',
        targetApp: 'fysh',
        userId: 'user-1',
      })
    ).toThrow('Invalid session assurance');
    expect(() =>
      createAppCoordinationToken({
        amr: ['password'],
        targetApp: 'fysh',
        userId: 'user-1',
      })
    ).toThrow('Invalid session assurance');
  });
});
