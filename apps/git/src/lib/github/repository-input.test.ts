import { describe, expect, it } from 'vitest';
import { normalizeRepositoryInput } from './repository-input';

describe('normalizeRepositoryInput', () => {
  it.each([
    ['tutur3u/platform', { name: 'platform', owner: 'tutur3u' }],
    [
      'https://github.com/tutur3u/platform',
      { name: 'platform', owner: 'tutur3u' },
    ],
    [
      'https://github.com/tutur3u/platform.git',
      { name: 'platform', owner: 'tutur3u' },
    ],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeRepositoryInput(input)).toEqual(expected);
  });

  it.each([
    'https://github.example.com/tutur3u/platform',
    'http://github.com/tutur3u/platform',
    'https://github.com/tutur3u/platform/issues',
    'https://github.com/tutur3u/platform?q=private',
    'tutur3u',
  ])('rejects unsupported input %s', (input) => {
    expect(() => normalizeRepositoryInput(input)).toThrow();
  });
});
