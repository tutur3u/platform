import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { expect } from 'vitest';

export function expectStaticAssetMatcher(matchers: readonly string[]) {
  expect(matchers).toHaveLength(3);
  const matches = (url: string) =>
    unstable_doesMiddlewareMatch({ config: { matcher: [...matchers] }, url });
  for (const path of [
    '/audio/example.mp3',
    '/audio/example.wav',
    '/audio/example.ogg',
    '/audio/example.m4a',
    '/fonts/subsets/noto-sans-latin-core.woff2',
    '/fonts/subsets/noto-sans-latin-core.7b24cd8019.woff2',
    '/fonts/subsets/OFL-notosans.txt',
  ]) {
    expect(matches(path), path).toBe(false);
  }
  for (const path of [
    '/roadmap',
    '/roadmap/screenshot.png',
    '/en/personal',
    '/api/v1/workspaces/example',
    '/api/v1/fonts/subsets/example',
    '/fonts/private.woff2',
    '/en/fonts/subsets/example',
  ]) {
    expect(matches(path), path).toBe(true);
  }
}
