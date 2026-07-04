import { describe, expect, it } from 'vitest';
import {
  createAuthRecoveryCode,
  createAuthRecoveryToken,
  hashAuthRecoveryCode,
  hashAuthRecoveryToken,
} from './recovery-crypto';

describe('auth recovery credential crypto', () => {
  it('generates short numeric codes and high-entropy URL tokens', () => {
    expect(createAuthRecoveryCode()).toMatch(/^\d{6}$/u);
    expect(createAuthRecoveryToken()).toMatch(/^[A-Za-z0-9_-]{32,}$/u);
  });

  it('hashes tokens and email-scoped codes deterministically without returning raw values', () => {
    const tokenHash = hashAuthRecoveryToken('raw-token');
    const codeHash = hashAuthRecoveryCode('Person@Example.com', '123456');

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(codeHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(tokenHash).not.toContain('raw-token');
    expect(codeHash).toBe(hashAuthRecoveryCode('person@example.com', '123456'));
    expect(codeHash).not.toBe(
      hashAuthRecoveryCode('other@example.com', '123456')
    );
  });
});
