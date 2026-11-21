import { describe, expect, it } from 'vitest';
import {
  mastermindRedirect,
  mastermindRedirectDestination,
} from './mastermind-redirect';

describe('Mastermind apex redirect', () => {
  it.each([
    ['tuturuuu.com/mastermind', 'https://mastermind.tuturuuu.com/'],
    ['tuturuuu.com/mastermind/', 'https://mastermind.tuturuuu.com/'],
    ['tuturuuu.com/mastermind/vi', 'https://mastermind.tuturuuu.com/vi'],
    [
      'tuturuuu.com/mastermind/en?tab=inbox',
      'https://mastermind.tuturuuu.com/en?tab=inbox',
    ],
    [
      'tuturuuu.com/mastermind//evil.example',
      'https://mastermind.tuturuuu.com//evil.example',
    ],
  ])('sends %s to %s', (from, to) => {
    const destination = mastermindRedirectDestination(
      new Request(`https://${from}#fragment`)
    );
    expect(destination?.href).toBe(to);
    expect(destination?.host).toBe('mastermind.tuturuuu.com');
  });

  it.each([
    'tuturuuu.com/',
    'tuturuuu.com/mastermindx',
    'tuturuuu.com/en/mastermind',
    'tuturuuu.com/api/v1/mastermind/fleet/state',
    'mastermind.tuturuuu.com/mastermind',
    'www.tuturuuu.com/mastermind',
  ])('leaves %s alone', (from) => {
    expect(
      mastermindRedirectDestination(new Request(`https://${from}`))
    ).toBeNull();
  });

  it('is a plain uncached 302 for every method', () => {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const response = mastermindRedirect(
        new Request('https://tuturuuu.com/mastermind/en', { method })
      );
      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe(
        'https://mastermind.tuturuuu.com/en'
      );
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});
