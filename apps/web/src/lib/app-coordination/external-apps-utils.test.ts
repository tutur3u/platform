import { describe, expect, it } from 'vitest';
import { normalizeOrigin, normalizeOrigins } from './external-apps-utils';

describe('external app origins', () => {
  it.each([
    'https://rewise.me',
    'https://www.rewise.me/callback',
    'https://rewise.school',
    'http://app.rewise.school:8443',
  ])('refuses to register or match released Rewise origin %s', (value) => {
    expect(normalizeOrigin(value)).toBeNull();
  });

  it('drops released Rewise origins from a registration list', () => {
    expect(
      normalizeOrigins([
        'https://rewise.school',
        'https://rewise.tuturuuu.com/c',
        'https://rewise.me',
      ])
    ).toEqual(['https://rewise.tuturuuu.com']);
  });

  it('keeps ordinary origins', () => {
    expect(normalizeOrigin(' https://app.example.com/path ')).toBe(
      'https://app.example.com'
    );
  });
});
