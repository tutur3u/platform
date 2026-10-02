import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { handleLocale } from './locale-proxy';

describe('public marketing locale URLs', () => {
  it.each(['/vi', '/vi/products/tasks', '/vi/legal/dpa'])(
    'keeps %s accessible at its Vietnamese canonical URL',
    (pathname) => {
      const response = handleLocale({
        req: new NextRequest(`https://tuturuuu.com${pathname}`, {
          headers: { 'accept-language': 'vi' },
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe('vi');
    }
  );
  it('keeps unprefixed marketing URLs English despite a Vietnamese preference', () => {
    const response = handleLocale({
      req: new NextRequest('https://tuturuuu.com/products/tasks', {
        headers: { cookie: 'NEXT_LOCALE=vi', 'accept-language': 'vi' },
      }),
    });
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tuturuuu.com/en/products/tasks'
    );
  });
  it('redirects explicit English URLs to the unprefixed canonical', () => {
    const response = handleLocale({
      req: new NextRequest('https://tuturuuu.com/en/products/tasks'),
    });
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/products/tasks'
    );
  });
});
