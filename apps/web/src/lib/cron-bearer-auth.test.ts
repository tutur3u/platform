import { describe, expect, it } from 'vitest';
import { verifyBearerSecrets } from './cron-bearer-auth';

describe('verifyBearerSecrets', () => {
  it('accepts an exact matching Bearer secret', () => {
    expect(verifyBearerSecrets('Bearer alpha-secret', ['alpha-secret'])).toBe(
      true
    );
    expect(
      verifyBearerSecrets('Bearer beta-secret', ['alpha-secret', 'beta-secret'])
    ).toBe(true);
  });

  it('rejects missing, malformed, or mismatched Bearer headers', () => {
    expect(verifyBearerSecrets(null, ['alpha-secret'])).toBe(false);
    expect(verifyBearerSecrets('', ['alpha-secret'])).toBe(false);
    expect(verifyBearerSecrets('alpha-secret', ['alpha-secret'])).toBe(false);
    expect(verifyBearerSecrets('Basic alpha-secret', ['alpha-secret'])).toBe(
      false
    );
    expect(verifyBearerSecrets('Bearer wrong-secret', ['alpha-secret'])).toBe(
      false
    );
    expect(verifyBearerSecrets('Bearer alpha-secret ', ['alpha-secret'])).toBe(
      false
    );
  });

  it('fails closed when no configured secret is present', () => {
    expect(verifyBearerSecrets('Bearer ', [''])).toBe(false);
    expect(verifyBearerSecrets('Bearer any', [undefined, null, ''])).toBe(
      false
    );
  });
});
