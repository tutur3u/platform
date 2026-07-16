import { describe, expect, it } from 'vitest';
import { isPrivateNetworkAddress } from './managed-asset-url-policy';

describe('managed external-project asset import SSRF guard', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])('rejects private or reserved address %s', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isPrivateNetworkAddress(address)).toBe(false);
    }
  );
});
