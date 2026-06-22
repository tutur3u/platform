import { describe, expect, it } from 'vitest';
import {
  isExternalHref,
  resolveHref,
  shouldInterceptNavigation,
} from './next-link-shim';

describe('resolveHref', () => {
  it('returns string hrefs unchanged', () => {
    expect(resolveHref('/en/ws/tasks')).toBe('/en/ws/tasks');
  });

  it('builds href from object pathname + hash', () => {
    expect(resolveHref({ pathname: '/en/ws', hash: 'section' })).toBe(
      '/en/ws#section'
    );
    expect(resolveHref({ pathname: '/en/ws', hash: '#section' })).toBe(
      '/en/ws#section'
    );
    expect(resolveHref({ pathname: '/en/ws' })).toBe('/en/ws');
  });
});

describe('isExternalHref', () => {
  it('treats schemes and protocol-relative urls as external', () => {
    for (const href of [
      'https://x.com',
      'http://x.com',
      'mailto:a@b.com',
      'tel:+123',
      '//cdn.example.com',
      '',
    ]) {
      expect(isExternalHref(href)).toBe(true);
    }
  });

  it('treats rooted/relative local paths as internal', () => {
    for (const href of ['/en/ws/tasks', '/', 'tasks', '#anchor']) {
      expect(isExternalHref(href)).toBe(false);
    }
  });
});

describe('shouldInterceptNavigation', () => {
  const base = {
    defaultPrevented: false,
    href: '/en/ws/tasks',
    modifierKey: false,
    primaryButton: true,
    target: undefined as string | undefined,
  };

  it('intercepts a plain left-click on an internal href', () => {
    expect(shouldInterceptNavigation(base)).toBe(true);
  });

  it('does not intercept when default was prevented', () => {
    expect(shouldInterceptNavigation({ ...base, defaultPrevented: true })).toBe(
      false
    );
  });

  it('does not intercept modified clicks or non-primary buttons', () => {
    expect(shouldInterceptNavigation({ ...base, modifierKey: true })).toBe(
      false
    );
    expect(shouldInterceptNavigation({ ...base, primaryButton: false })).toBe(
      false
    );
  });

  it('does not intercept target=_blank (but allows _self)', () => {
    expect(shouldInterceptNavigation({ ...base, target: '_blank' })).toBe(
      false
    );
    expect(shouldInterceptNavigation({ ...base, target: '_self' })).toBe(true);
  });

  it('does not intercept external hrefs', () => {
    expect(shouldInterceptNavigation({ ...base, href: 'https://x.com' })).toBe(
      false
    );
  });
});
