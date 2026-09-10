import { describe, expect, it } from 'vitest';
import { decodeMailHeader, mailDisplayName } from './address-names';

describe('mail display names', () => {
  it.each([
    'Khánh Hà',
    '=?UTF-8?Q?Kh=C3=A1nh_H=C3=A0?=',
    '=?iso-8859-1?Q?Kh=E1nh_H=E0?=',
    '=?UTF-8?Q?Kh=E1nh_H=E0?=',
    '=?UTF-8?B?S2jhbmggSOA=?=',
  ])('decodes %s without replacement characters', (value) => {
    expect(decodeMailHeader(value)).toBe('Khánh Hà');
  });
  it('recovers persisted damage using the matching original recipient header', () => {
    expect(
      mailDisplayName(
        'Kh�nh H�',
        'k@example.com',
        '=?UTF-8?Q?Kh=E1nh_H=E0?= <k@example.com>'
      )
    ).toBe('Khánh Hà');
  });
  it('preserves quoted commas and matches the correct address', () => {
    expect(
      mailDisplayName(
        null,
        'b@example.com',
        '"First, Person" <a@example.com>, "Khánh Hà" <b@example.com>'
      )
    ).toBe('Khánh Hà');
  });
  it('does not invent a name when damaged bytes are no longer available', () => {
    expect(mailDisplayName('Kh�nh H�', 'k@example.com')).toBeNull();
  });
  it('preserves adjacent encoded words splitting UTF-8 bytes', () => {
    expect(
      decodeMailHeader('=?UTF-8?Q?Kh=C3?= =?UTF-8?Q?=A1nh_H=C3=A0?=')
    ).toBe('Khánh Hà');
  });
});
