import { describe, expect, it } from 'vitest';
import { PAGE_REWRITE_HEADER, withoutPageRewrite } from './page-rewrite';

describe('withoutPageRewrite', () => {
  it('drops a client-sent rewrite header and keeps the rest', () => {
    const request = withoutPageRewrite(
      new Request('https://tasks.tuturuuu.com/en/a', {
        headers: { [PAGE_REWRITE_HEADER]: '/en/x', cookie: 'a=1' },
      })
    );

    expect(request.headers.has(PAGE_REWRITE_HEADER)).toBe(false);
    expect(request.headers.get('cookie')).toBe('a=1');
    expect(request.url).toBe('https://tasks.tuturuuu.com/en/a');
  });

  it('returns the same request when there is nothing to drop', () => {
    const request = new Request('https://tasks.tuturuuu.com/');

    expect(withoutPageRewrite(request)).toBe(request);
  });
});
