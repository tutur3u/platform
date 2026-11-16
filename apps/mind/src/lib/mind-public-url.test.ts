import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ baseUrl: 'https://tuturuuu.com/mind' }));

vi.mock('@/constants/common', () => ({
  get BASE_URL() {
    return config.baseUrl;
  },
}));

import { createMindPublicUrl } from './mind-public-url';

describe('Mind public URL ownership', () => {
  beforeEach(() => {
    config.baseUrl = 'https://tuturuuu.com/mind';
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['/', 'https://tuturuuu.com/mind'],
    ['/mind', 'https://tuturuuu.com/mind'],
    ['/mind/', 'https://tuturuuu.com/mind'],
    ['/boards/board/', 'https://tuturuuu.com/mind/boards/board'],
    ['/mind/boards/board', 'https://tuturuuu.com/mind/boards/board'],
    ['/mindful', 'https://tuturuuu.com/mind/mindful'],
    ['/boards/100%25', 'https://tuturuuu.com/mind/boards/100%25'],
    [
      '/verify-token?nextUrl=%2Fboards%2Fone#finish',
      'https://tuturuuu.com/mind/verify-token?nextUrl=%2Fboards%2Fone#finish',
    ],
    [
      '/?next=https%3A%2F%2Foutside.example',
      'https://tuturuuu.com/mind?next=https%3A%2F%2Foutside.example',
    ],
  ])('keeps %j within the app exactly once', (path, expected) => {
    expect(createMindPublicUrl(path).toString()).toBe(expected);
  });

  it.each([
    '//outside.example',
    'https://outside.example',
    '/\\outside.example',
    '/\t/outside.example',
    '/../outside',
    '/%2e%2e/outside',
    '/%252e%252e/outside',
    '/%5coutside.example',
    '/mind/../../outside',
  ])('rejects an authority or app-boundary escape %j', (path) => {
    expect(() => createMindPublicUrl(path)).toThrow();
  });

  it('ignores an untrusted production request origin', () => {
    expect(
      createMindPublicUrl(
        '/login',
        new Request('https://outside.example/')
      ).toString()
    ).toBe('https://tuturuuu.com/mind/login');
  });

  it('keeps a local development request at its root', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      createMindPublicUrl(
        '/boards/one',
        new Request('http://localhost:7816/')
      ).toString()
    ).toBe('http://localhost:7816/boards/one');
  });

  it('keeps an explicitly configured local root without a request', () => {
    config.baseUrl = 'http://mind.tuturuuu.localhost';
    expect(createMindPublicUrl('/').toString()).toBe(
      'http://mind.tuturuuu.localhost/'
    );
  });
});
