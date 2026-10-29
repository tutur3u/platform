// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  polar: vi.fn(function Polar(options) {
    return { options };
  }),
}));
vi.mock('@tuturuuu/payment/polar', () => ({ Polar: mocks.polar }));

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import appConfig from '../start-bridge.config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('selects only Polar sandbox for the declared Pay staging profile', async () => {
  const profile = JSON.parse(
    await readFile(new URL('./staging-profile.json', import.meta.url), 'utf8')
  );
  expect(profile.POLAR_SANDBOX).toBe('true');
  expect(appConfig.mounts.rootHosts).toEqual(['pay.staging.tutur3u.com']);
  expect(appConfig.mounts.unknownHost).toBe('reject');
  expect(profile.PAY_APP_URL).toBe('https://pay.staging.tutur3u.com');
  expect(profile.INTERNAL_WEB_API_ORIGIN).toBe(
    'https://web.staging.tutur3u.com'
  );
  expect(profile.NEXT_PUBLIC_WEB_APP_URL).toBe(
    'https://web.staging.tutur3u.com'
  );
  vi.stubEnv('POLAR_SANDBOX', profile.POLAR_SANDBOX);
  vi.stubEnv('POLAR_ACCESS_TOKEN', 'disposable-sandbox-token');
  createPolarClient();
  expect(mocks.polar).toHaveBeenCalledWith({
    accessToken: 'disposable-sandbox-token',
    server: 'sandbox',
  });
});
