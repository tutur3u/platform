import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import LoginLayout, * as layoutModule from './layout';
import { metadata } from './layout';

describe('login segment layout', () => {
  it('keeps the login segment noindex without cache-incompatible config', () => {
    expect('dynamic' in layoutModule).toBe(false);
    expect('revalidate' in layoutModule).toBe(false);
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
