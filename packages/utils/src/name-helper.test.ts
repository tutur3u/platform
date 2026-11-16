import { describe, expect, it } from 'vitest';
import {
  resolveProfileNamePlaceholders,
  resolveUserDisplayName,
  resolveUserFullName,
} from './name-helper';

const EMAIL = 'phucvo@tuturuuu.com';

describe('resolveUserDisplayName', () => {
  it.each([
    [
      { display_name: 'Phúc', full_name: 'Võ Hoàng Phúc', email: EMAIL },
      'Phúc',
    ],
    [
      { display_name: null, full_name: 'Võ Hoàng Phúc', email: EMAIL },
      'Võ Hoàng Phúc',
    ],
    [{ display_name: '', full_name: '', email: EMAIL }, EMAIL],
    [{ display_name: '   ', full_name: '\t\n', email: EMAIL }, EMAIL],
    [{ display_name: '  Phúc  ' }, 'Phúc'],
    [{ display_name: null, full_name: '  Võ  ', email: EMAIL }, 'Võ'],
    [
      { display_name: null, full_name: null, email: null, handle: 'phuc' },
      'phuc',
    ],
    [{ display_name: null, username: 'phuc-u' }, 'phuc-u'],
    [{ email: `  ${EMAIL}  `, handle: 'phuc' }, EMAIL],
    [{ displayName: 'Camel', fullName: 'Camel Full' }, 'Camel'],
    [{ displayName: ' ', fullName: 'Camel Full' }, 'Camel Full'],
  ])('resolves %j → %s', (user, expected) => {
    expect(resolveUserDisplayName(user)).toBe(expected);
  });

  it('prefers snake_case display_name over camelCase when both exist', () => {
    expect(
      resolveUserDisplayName({ display_name: 'Snake', displayName: 'Camel' })
    ).toBe('Snake');
  });

  it('never returns "Unknown" and uses the fallback only when nothing is set', () => {
    expect(resolveUserDisplayName({})).toBe('');
    expect(resolveUserDisplayName(null)).toBe('');
    expect(resolveUserDisplayName(undefined, { fallback: '—' })).toBe('—');
    expect(
      resolveUserDisplayName(
        { display_name: ' ', full_name: ' ', email: ' ', handle: ' ' },
        { fallback: '—' }
      )
    ).toBe('—');
    expect(resolveUserDisplayName({ email: EMAIL }, { fallback: '—' })).toBe(
      EMAIL
    );
  });

  it('shortens email to its local part only when asked', () => {
    expect(
      resolveUserDisplayName({ email: EMAIL }, { emailLocalPart: true })
    ).toBe('phucvo');
    expect(
      resolveUserDisplayName(
        { display_name: 'Phúc', email: EMAIL },
        { emailLocalPart: true }
      )
    ).toBe('Phúc');
    expect(
      resolveUserDisplayName({ email: 'no-at-sign' }, { emailLocalPart: true })
    ).toBe('no-at-sign');
  });
});

describe('resolveUserFullName', () => {
  it('keeps full-name semantics when a full name is set', () => {
    expect(
      resolveUserFullName({ display_name: 'Phúc', full_name: 'Võ Hoàng Phúc' })
    ).toBe('Võ Hoàng Phúc');
  });

  it('falls back to display name, then email', () => {
    expect(resolveUserFullName({ display_name: 'Phúc', full_name: ' ' })).toBe(
      'Phúc'
    );
    expect(resolveUserFullName({ full_name: null, email: EMAIL })).toBe(EMAIL);
    expect(resolveUserFullName(null, { fallback: '—' })).toBe('—');
  });
});

describe('resolveProfileNamePlaceholders', () => {
  it.each([
    [
      { display_name: 'Phúc', full_name: 'Võ Hoàng Phúc', email: EMAIL },
      { displayName: 'Võ Hoàng Phúc', fullName: 'Phúc' },
    ],
    [
      { display_name: 'Phúc', full_name: null, email: EMAIL },
      { displayName: EMAIL, fullName: 'Phúc' },
    ],
    [
      { display_name: '  ', full_name: 'Võ Hoàng Phúc', email: EMAIL },
      { displayName: 'Võ Hoàng Phúc', fullName: EMAIL },
    ],
    [
      { display_name: null, full_name: '', email: EMAIL },
      { displayName: EMAIL, fullName: EMAIL },
    ],
    [
      { display_name: null, full_name: null, email: null },
      { displayName: '', fullName: '' },
    ],
    [null, { displayName: '', fullName: '' }],
  ])('placeholders for %j', (user, expected) => {
    expect(resolveProfileNamePlaceholders(user)).toEqual(expected);
  });
});
