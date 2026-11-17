import { describe, expect, it } from 'vitest';
import {
  canManageSenderBlocks,
  profileBlockOptions,
} from './mail-profile-block-model';

describe('canManageSenderBlocks', () => {
  it('allows owners and admins only', () => {
    expect(canManageSenderBlocks('owner')).toBe(true);
    expect(canManageSenderBlocks('admin')).toBe(true);
    expect(canManageSenderBlocks('sender')).toBe(false);
    expect(canManageSenderBlocks('viewer')).toBe(false);
    expect(canManageSenderBlocks(undefined)).toBe(false);
  });
});

describe('profileBlockOptions', () => {
  it('offers the address and its domain to owners and admins', () => {
    expect(profileBlockOptions('admin', ' Team@SePay.vn ')).toEqual({
      address: 'team@sepay.vn',
      domain: { value: 'sepay.vn', disabledReason: null },
    });
  });

  it('disables the domain for public providers', () => {
    expect(profileBlockOptions('owner', 'someone@gmail.com')).toEqual({
      address: 'someone@gmail.com',
      domain: { value: 'gmail.com', disabledReason: 'shared_provider' },
    });
  });

  it('offers nothing to other roles or for invalid addresses', () => {
    expect(profileBlockOptions('sender', 'team@sepay.vn')).toBeNull();
    expect(profileBlockOptions('viewer', 'team@sepay.vn')).toBeNull();
    expect(profileBlockOptions('owner', 'not-an-address')).toBeNull();
  });
});
