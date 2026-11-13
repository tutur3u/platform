import { expect, it } from 'vitest';
import { marketingMessagePaths } from './marketing-render-context';

it('sends only landing and shared shell messages for both landing locales', () => {
  for (const pathname of ['/', '/en', '/vi']) {
    const paths = marketingMessagePaths(pathname);
    expect(paths).toContain('landing');
    expect(paths).toContain('commercialComparison');
    expect(paths).toContain('marketing-nav');
    expect(paths).toContain('privacy-consent');
    expect(paths).not.toContain('contact');
    expect(paths).not.toContain('branding');
  }
});

it('preserves complete messages for other routes and non-bridge rendering', () => {
  for (const pathname of ['/contact', '/vi/contact', undefined]) {
    expect(marketingMessagePaths(pathname)).toContain('contact');
    expect(marketingMessagePaths(pathname)).toContain('branding');
  }
});
