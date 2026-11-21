import { describe, expect, it } from 'vitest';
import { parseManagedAccountAddress } from './managed-address';

describe('managed directory address classification', () => {
  it.each([
    'person@tuturuuu.com',
    'person@xwf.tuturuuu.com',
    'person@a.b.tuturuuu.com',
  ])('includes genuine managed address %s', (value) => {
    expect(parseManagedAccountAddress(value)?.address).toBe(value);
  });
  it('normalizes ASCII case without granting root status to a subdomain', () => {
    expect(parseManagedAccountAddress('Person@XWF.TUTURUUU.COM')).toEqual({
      address: 'person@xwf.tuturuuu.com',
      domain: 'xwf.tuturuuu.com',
      isRoot: false,
    });
    expect(parseManagedAccountAddress('person@tuturuuu.com')?.isRoot).toBe(
      true
    );
  });
  it.each([
    'person@tuturuuu.com.example',
    'person@eviltuturuuu.com',
    'person@tutur3u.com',
    'person@tuturuuu.com.',
    'person@.tuturuuu.com',
    'person@a..tuturuuu.com',
    'person@-x.tuturuuu.com',
    'person@x-.tuturuuu.com',
    'person@@tuturuuu.com',
    '@tuturuuu.com',
    '.person@tuturuuu.com',
    'person..name@tuturuuu.com',
    ' person@tuturuuu.com',
    'person@tuturuuu.com ',
    'Person <person@tuturuuu.com>',
    'person@tuturuuu．com',
    'person@tuturuυu.com',
    'person@x\ntuturuuu.com',
    'pérson@tuturuuu.com',
    '"person"@tuturuuu.com',
    'person@xn--tuturuuu.com',
    `person@${'a'.repeat(64)}.tuturuuu.com`,
    `${'a'.repeat(65)}@tuturuuu.com`,
  ])('rejects lookalikes and malformed address %s', (value) => {
    expect(parseManagedAccountAddress(value)).toBeNull();
  });
});
