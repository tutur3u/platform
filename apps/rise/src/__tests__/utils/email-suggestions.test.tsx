import { suggestEmails } from '@/utils/email-helper';
import { describe, expect, it } from 'vitest';

describe('suggestEmails', () => {
  it('should return an array of suggested emails', () => {
    const text = 'johndoe';
    const expectedSuggestions = [
      'johndoe@gmail.com',
      'johndoe@yahoo.com',
      'johndoe@outlook.com',
      'johndoe@tuturuuu.com',
    ];
    const suggestions = suggestEmails(text);
    expect(suggestions).toEqual(expectedSuggestions);
  });
});
