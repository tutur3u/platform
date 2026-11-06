import { describe, expect, it } from 'vitest';
import { createProxyMatcher } from './proxy-matcher';

describe('createProxyMatcher', () => {
  it('evaluates the satellites’ matcher like Next', () => {
    const matches = createProxyMatcher(['/((?!_next|.*\\..*).*)'], () => false);
    expect(matches('/')).toBe(true);
    expect(matches('/en/ws/products')).toBe(true);
    expect(matches('/api/v1/x')).toBe(true);
    expect(matches('/_next/static/chunk.js')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/assets/app.css')).toBe(false);
  });

  it('supports API-only and named-parameter matchers', () => {
    const api = createProxyMatcher({ source: '/api/:path*' }, () => false);
    expect(api('/api/v1/users')).toBe(true);
    expect(api('/en')).toBe(false);
  });

  it('runs the proxy for conditional entries and falls back without a matcher', () => {
    const conditional = createProxyMatcher(
      [{ source: '/x', has: [{ type: 'header', key: 'h' }] }],
      () => false
    );
    expect(conditional('/anything')).toBe(true);
    expect(createProxyMatcher(undefined, (path) => path === '/y')('/y')).toBe(
      true
    );
  });
});
