import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptEventForStorage } from './workspace-encryption';

afterEach(() => vi.unstubAllEnvs());

const event = {
  title: 'Salary review',
  description: 'private',
  location: null,
};

describe('encryptEventForStorage without a key', () => {
  it('refuses to store plaintext where encryption is required', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    await expect(
      encryptEventForStorage('ws', event, null)
    ).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE',
    });
    await expect(encryptEventForStorage('ws', event)).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE',
    });
  });

  it('refuses when only TUTURUUU_REQUIRE_SECRETS is set', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TUTURUUU_REQUIRE_SECRETS', '1');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    await expect(
      encryptEventForStorage('ws', event, null)
    ).rejects.toMatchObject({ code: 'ENCRYPTION_UNAVAILABLE' });
  });

  it('still stores plaintext in development and when explicitly opted out', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    expect(await encryptEventForStorage('ws', event, null)).toEqual({
      ...event,
      is_encrypted: false,
    });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_REQUIRED', '0');
    expect((await encryptEventForStorage('ws', event, null)).is_encrypted).toBe(
      false
    );
  });
});
