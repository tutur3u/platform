import { describe, expect, it } from 'vitest';
import { withoutMiddlewareHeaders } from './proxy-bridge';

describe('withoutMiddlewareHeaders', () => {
  it('drops internal middleware headers and keeps the response', () => {
    const response = new Response(null, {
      status: 307,
      headers: {
        location: 'https://tuturuuu.com/admin/x',
        'set-cookie': 'NEXT_LOCALE=en; Path=/admin',
        'x-middleware-set-cookie':
          'NEXT_LOCALE=en; Path=/; Domain=.tuturuuu.com',
        'x-middleware-next': '1',
      },
    });
    const result = withoutMiddlewareHeaders(response);
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toBe('https://tuturuuu.com/admin/x');
    expect(result.headers.get('set-cookie')).toBe(
      'NEXT_LOCALE=en; Path=/admin'
    );
    expect(
      [...result.headers.keys()].some((n) => n.startsWith('x-middleware-'))
    ).toBe(false);
  });

  it('copies an immutable response instead of failing', () => {
    const immutable = Response.redirect('https://tuturuuu.com/a', 307);
    Object.defineProperty(immutable, 'headers', {
      value: new Proxy(
        new Headers({ 'x-middleware-rewrite': '/x', location: '/a' }),
        {
          get(target, prop) {
            if (prop === 'delete')
              return () => {
                throw new TypeError('immutable');
              };
            const value = Reflect.get(target, prop);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }
      ),
    });
    const result = withoutMiddlewareHeaders(immutable);
    expect(result.headers.has('x-middleware-rewrite')).toBe(false);
  });
});
