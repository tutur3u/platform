import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { meetDeviceIdentity } from './call-session';

it('binds a stable device identity to both account and device', async () => {
  const identity = await meetDeviceIdentity('account-a', 'device-a');
  expect(await meetDeviceIdentity('account-a', 'device-a')).toBe(identity);
  expect(await meetDeviceIdentity('account-b', 'device-a')).not.toBe(identity);
  expect(await meetDeviceIdentity('account-a', 'device-b')).not.toBe(identity);
  expect(identity).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
  );
});
