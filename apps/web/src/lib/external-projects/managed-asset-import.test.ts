import { describe, expect, it } from 'vitest';
import {
  isPrivateNetworkAddress,
  resolveSafeManagedAssetAddress,
} from './managed-asset-url-policy';

describe('managed external-project asset import SSRF guard', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.8',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.254',
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

  it('returns the validated address that must be pinned for the request', async () => {
    const address = await resolveSafeManagedAssetAddress(
      new URL('https://assets.example.com/file.png'),
      async () => [{ address: '1.1.1.1', family: 4 }]
    );

    expect(address).toEqual({ address: '1.1.1.1', family: 4 });
  });

  it('rejects a hostname when any resolved address is private', async () => {
    await expect(
      resolveSafeManagedAssetAddress(
        new URL('https://assets.example.com/file.png'),
        async () => [
          { address: '1.1.1.1', family: 4 },
          { address: '169.254.169.254', family: 4 },
        ]
      )
    ).rejects.toThrow('private or reserved');
  });
});
