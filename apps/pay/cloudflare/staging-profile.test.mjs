import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ polar: vi.fn((options) => ({ options })) }));
vi.mock('@tuturuuu/payment/polar', () => ({ Polar: mocks.polar }));

import { createPolarClient } from '@tuturuuu/payment/polar/server';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('selects only Polar sandbox for the declared Pay staging profile', async () => {
  const profile = JSON.parse(
    await readFile(new URL('./staging-profile.json', import.meta.url), 'utf8')
  );
  expect(profile.POLAR_SANDBOX).toBe('true');
  expect(profile.PAY_APP_URL).toBe('https://pay-staging.tuturuuu.com');
  expect(profile.INTERNAL_WEB_API_ORIGIN).toBe('https://staging.tuturuuu.com');
  expect(profile.NEXT_PUBLIC_WEB_APP_URL).toBe('https://staging.tuturuuu.com');
  vi.stubEnv('POLAR_SANDBOX', profile.POLAR_SANDBOX);
  vi.stubEnv('POLAR_ACCESS_TOKEN', 'disposable-sandbox-token');
  createPolarClient();
  expect(mocks.polar).toHaveBeenCalledWith({
    accessToken: 'disposable-sandbox-token',
    server: 'sandbox',
  });
});
