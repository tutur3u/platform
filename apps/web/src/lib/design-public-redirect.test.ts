import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_REDIRECT_CACHE_CONTROL,
  designRedirectPath,
  designRedirectResponse,
  isDesignPublicPath,
} from './design-public-redirect';

describe('design public paths', () => {
  it('accepts the design home and its children, including localized URLs', () => {
    expect(isDesignPublicPath('/design')).toBe(true);
    expect(isDesignPublicPath('/design/')).toBe(true);
    expect(isDesignPublicPath('/design/components/button')).toBe(true);
    expect(isDesignPublicPath('/en/design')).toBe(true);
    expect(isDesignPublicPath('/vi/design/setup')).toBe(true);
  });

  it('rejects a neighbouring segment', () => {
    expect(isDesignPublicPath('/design-private')).toBe(false);
    expect(isDesignPublicPath('/en/design-private')).toBe(false);
    expect(isDesignPublicPath('/designer')).toBe(false);
    expect(isDesignPublicPath('/ui')).toBe(false);
  });
});

describe('legacy ui redirects', () => {
  it.each([
    ['/ui', '/design'],
    ['/ui/', '/design'],
    ['/en/ui', '/en/design'],
    ['/vi/ui/components', '/vi/design/components'],
    ['/ui/components/button', '/design/components/button'],
    ['/en/ui/contributing', '/en/design/contributing'],
    ['/vi/ui/setup', '/vi/design/setup'],
  ])('maps %s to %s', (pathname, expected) => {
    expect(designRedirectPath(pathname)).toBe(expected);
  });

  it('leaves neighbouring and unrelated paths alone', () => {
    expect(designRedirectPath('/ui-private')).toBeNull();
    expect(designRedirectPath('/en/ui-private')).toBeNull();
    expect(designRedirectPath('/design')).toBeNull();
    expect(designRedirectPath('/branding')).toBeNull();
    expect(designRedirectPath('/personal/ui')).toBeNull();
  });

  it('returns a cacheable 301 and keeps the query string', () => {
    const response = designRedirectResponse(
      new NextRequest('http://localhost/en/ui/components/button?theme=dark')
    );

    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe(
      'http://localhost/en/design/components/button?theme=dark'
    );
    expect(response?.headers.get('cache-control')).toBe(
      DESIGN_REDIRECT_CACHE_CONTROL
    );
  });
});
