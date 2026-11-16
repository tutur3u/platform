import { describe, expect, it } from 'vitest';
import en from '../../../../../messages/en.json';
import viMessages from '../../../../../messages/vi.json';

const ACCOUNT_KEYS = [
  'accounts',
  'accounts_description',
  'connected_accounts_error',
  'connecting_provider',
  'in_use',
  'mailbox_settings',
  'manage_accounts',
  'personal_mailbox',
  'provider_google',
  'provider_microsoft',
  'role_admin',
  'role_owner',
  'shared_mailbox',
  'switch_account',
] as const;

describe('Mail account picker and settings messages', () => {
  it('ships every key in English and Vietnamese', () => {
    for (const bundle of [en.mail, viMessages.mail]) {
      for (const key of ACCOUNT_KEYS) {
        expect(bundle[key], key).toEqual(expect.any(String));
        expect(bundle[key]?.length, key).toBeGreaterThan(0);
      }
    }
  });

  it('drops the source radio copy that the picker replaces', () => {
    for (const bundle of [en.mail, viMessages.mail]) {
      expect(bundle).not.toHaveProperty('source');
      expect(bundle).not.toHaveProperty('source_description');
    }
  });
});
