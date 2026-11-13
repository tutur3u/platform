import { describe, expect, it } from 'vitest';
import {
  EncryptionUnavailableError,
  isEncryptionRequired,
} from '../encryption-required';

describe('isEncryptionRequired', () => {
  it('requires encryption in production and under TUTURUUU_REQUIRE_SECRETS', () => {
    expect(isEncryptionRequired({ NODE_ENV: 'production' })).toBe(true);
    expect(isEncryptionRequired({ TUTURUUU_REQUIRE_SECRETS: '1' })).toBe(true);
    expect(isEncryptionRequired({ ENCRYPTION_REQUIRED: 'true' })).toBe(true);
  });

  it('does not require it in development or test', () => {
    expect(isEncryptionRequired({ NODE_ENV: 'development' })).toBe(false);
    expect(isEncryptionRequired({ NODE_ENV: 'test' })).toBe(false);
    expect(isEncryptionRequired({})).toBe(false);
  });

  it('lets ENCRYPTION_REQUIRED=0 opt a production install out', () => {
    expect(
      isEncryptionRequired({ NODE_ENV: 'production', ENCRYPTION_REQUIRED: '0' })
    ).toBe(false);
  });

  it('carries a stable error code', () => {
    expect(new EncryptionUnavailableError().code).toBe(
      'ENCRYPTION_UNAVAILABLE'
    );
  });
});
