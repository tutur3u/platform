import { expect, it } from 'vitest';
import {
  contactBankKey,
  decryptBankAccount,
  encryptBankAccount,
} from './contact-bank';

const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const scope = { wsId: 'test-workspace', contactId: 'test-contact' };
const details = { holderName: 'Synthetic Holder', accountNumber: '0001234567' };

it('encrypts randomized, authenticated account envelopes bound to workspace and contact', () => {
  const first = encryptBankAccount(details, scope, key);
  const second = encryptBankAccount(details, scope, key);
  expect(first).not.toBe(second);
  expect(first).not.toContain(details.accountNumber);
  expect(first).not.toContain(details.holderName);
  expect(decryptBankAccount(first, scope, key)).toEqual(details);
  expect(() =>
    decryptBankAccount(first, { ...scope, wsId: 'another-tenant' }, key)
  ).toThrow();
  expect(() =>
    decryptBankAccount(first, { ...scope, contactId: 'another-person' }, key)
  ).toThrow();
  const [version, iv, _tag, encrypted] = first.split('.');
  expect(() =>
    decryptBankAccount(
      `${version}.${iv}.${Buffer.alloc(16).toString('base64url')}.${encrypted}`,
      scope,
      key
    )
  ).toThrow();
});

it('fails closed with missing or malformed key material', () => {
  expect(contactBankKey(undefined)).toBeNull();
  expect(contactBankKey('short')).toBeNull();
  expect(contactBankKey(key.toString('base64url'))).toEqual(key);
});
