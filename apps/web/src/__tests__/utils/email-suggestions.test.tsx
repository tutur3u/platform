import { describe, expect, it } from 'vitest';
import { suggestEmails } from '@/utils/email-helper';

describe('suggestEmails', () => {
  it('should suggest common email domains for a simple username', () => {
    const text = 'johndoe';
    const suggestions = suggestEmails(text);
    expect(suggestions).toContain('johndoe@gmail.com');
    expect(suggestions).toContain('johndoe@yahoo.com');
    expect(suggestions).toContain('johndoe@outlook.com');
    expect(suggestions).toContain('johndoe@tuturuuu.com');
  });

  it('should handle empty string', () => {
    const suggestions = suggestEmails('');
    expect(suggestions).toEqual([
      '@gmail.com',
      '@yahoo.com',
      '@outlook.com',
      '@tuturuuu.com',
    ]);
  });

  it('should handle string with @', () => {
    const text = 'user@';
    const suggestions = suggestEmails(text);
    expect(suggestions).toEqual([
      'user@gmail.com',
      'user@yahoo.com',
      'user@outlook.com',
      'user@tuturuuu.com',
    ]);
  });

  it('should handle string with partial domain', () => {
    const text = 'user@gm';
    const suggestions = suggestEmails(text);
    expect(suggestions).toEqual([
      'user@gmail.com',
      'user@yahoo.com',
      'user@outlook.com',
      'user@tuturuuu.com',
    ]);
  });

  it('should handle usernames with special characters', () => {
    const text = 'john.doe+test';
    const suggestions = suggestEmails(text);
    expect(suggestions).toContain('john.doe+test@gmail.com');
    expect(suggestions).toContain('john.doe+test@yahoo.com');
    expect(suggestions).toContain('john.doe+test@outlook.com');
    expect(suggestions).toContain('john.doe+test@tuturuuu.com');
  });

  it('should handle null and undefined', () => {
    expect(suggestEmails(null as unknown as string)).toEqual([
      '@gmail.com',
      '@yahoo.com',
      '@outlook.com',
      '@tuturuuu.com',
    ]);
    expect(suggestEmails(undefined as unknown as string)).toEqual([
      '@gmail.com',
      '@yahoo.com',
      '@outlook.com',
      '@tuturuuu.com',
    ]);
  });
});
