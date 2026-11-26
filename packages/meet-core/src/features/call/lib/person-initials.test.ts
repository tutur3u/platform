import { describe, expect, it } from 'vitest';
import { personInitial, personInitials } from './person-initials';

describe('personInitials', () => {
  it('skips an emoji word instead of splitting it', () => {
    expect(personInitials('Minh 🎨')).toBe('MI');
    expect(personInitials('Minh 🎨 Trần')).toBe('MT');
    expect(personInitials('🎨')).toBe('?');
  });

  it('keeps combining marks and Vietnamese letters whole', () => {
    expect(personInitials('Đặng Ánh')).toBe('ĐÁ');
    expect(personInitials('Ñu')).toBe('ÑU');
    expect(personInitials('ơn')).toBe('ƠN');
  });

  it('falls back when there is nothing to show', () => {
    expect(personInitials('   ')).toBe('?');
    expect(personInitials('', '')).toBe('');
  });
});

describe('personInitial', () => {
  it('returns the first whole character', () => {
    expect(personInitial('🎨 Minh')).toBe('🎨');
    expect(personInitial('  ánh')).toBe('Á');
    expect(personInitial('éva')).toBe('É');
    expect(personInitial('')).toBe('?');
  });
});
