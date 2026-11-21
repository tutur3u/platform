import { afterEach, expect, it, vi } from 'vitest';
import { getSepayOauthEnv } from './sepay-oauth';

afterEach(() => vi.unstubAllEnvs());

it('holds SePay OAuth until provider credentials are configured', () => {
  vi.stubEnv('SEPAY_OAUTH_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', 'synthetic-secret');
  vi.stubEnv('SEPAY_OAUTH_STATE_SECRET', undefined);
  vi.stubEnv('SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET', 'synthetic-key');
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', undefined);
  vi.stubEnv('SEPAY_WEBHOOK_SECRET', undefined);

  expect(getSepayOauthEnv()).toBeNull();
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', 'synthetic-webhook');
  expect(getSepayOauthEnv()).toMatchObject({ clientId: 'synthetic-client' });

  vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', '');
  expect(getSepayOauthEnv()).toBeNull();
});
