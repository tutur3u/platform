import { describe, expect, it } from 'vitest';
import { maskEmailForDisplay, resolveSessionAccountName } from './account-name';

describe('resolveSessionAccountName', () => {
  it('prefers the profile name, then metadata names', () => {
    expect(
      resolveSessionAccountName({
        displayName: ' Profile ',
        handle: 'h',
        metadata: { full_name: 'Full' },
      })
    ).toBe('Profile');
    expect(
      resolveSessionAccountName({ metadata: { full_name: 'Full', name: 'N' } })
    ).toBe('Full');
    expect(resolveSessionAccountName({ metadata: { name: 'N' } })).toBe('N');
  });

  it('falls back to the handle, then a masked email', () => {
    expect(
      resolveSessionAccountName({ displayName: '  ', handle: '@qa-host' })
    ).toBe('@qa-host');
    expect(
      resolveSessionAccountName({ email: 'qa+run-1@tutur3u.com', handle: '' })
    ).toBe('q•••@tutur3u.com');
    expect(resolveSessionAccountName({})).toBeNull();
    expect(resolveSessionAccountName({ email: 'a@b.co', handle: '@@' })).toBe(
      'a•••@b.co'
    );
  });

  it('masks a name field that holds an email address', () => {
    expect(
      resolveSessionAccountName({
        metadata: { full_name: 'person@example.com' },
      })
    ).toBe('p•••@example.com');
    expect(resolveSessionAccountName({ displayName: 'me@x.io' })).toBe(
      'm•••@x.io'
    );
    expect(resolveSessionAccountName({ displayName: 'Team @ HQ' })).toBe(
      'Team @ HQ'
    );
  });
});

describe('maskEmailForDisplay', () => {
  it.each([
    ['person@example.com', 'p•••@example.com'],
    [' a@b.co ', 'a•••@b.co'],
    ['𝒜x@example.com', '𝒜•••@example.com'],
    ['broken', null],
    ['@example.com', null],
    ['x@', null],
    [null, null],
  ])('masks %s', (input, expected) => {
    expect(maskEmailForDisplay(input)).toBe(expected);
  });
});
