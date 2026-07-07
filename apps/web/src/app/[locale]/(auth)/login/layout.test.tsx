import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import LoginLayout, { dynamic, metadata, revalidate } from './layout';

describe('login segment layout', () => {
  it('keeps the login segment static and noindex', () => {
    expect(dynamic).toBe('force-static');
    expect(revalidate).toBe(false);
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it('renders children without request-scoped dynamic work', () => {
    const children = <div data-testid="login-child" />;
    const result = LoginLayout({ children });

    expect(isValidElement(result)).toBe(true);
    expect(result).toBe(children);
  });
});
