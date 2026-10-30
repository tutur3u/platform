import { expect } from 'vitest';

export function expectStaticAssetMatcher(matchers: readonly string[]) {
  expect(matchers).toHaveLength(1);
  const matcher = new RegExp(`^${matchers.join('')}$`);
  for (const path of [
    '/audio/example.mp3',
    '/audio/example.wav',
    '/audio/example.ogg',
    '/audio/example.m4a',
    '/fonts/subsets/noto-sans-latin-core.woff2',
    '/fonts/subsets/OFL-notosans.txt',
  ]) {
    expect(matcher.test(path), path).toBe(false);
  }
  for (const path of [
    '/en/personal',
    '/api/v1/workspaces/example',
    '/api/v1/fonts/subsets/example',
    '/fonts/private.woff2',
    '/en/fonts/subsets/example',
  ]) {
    expect(matcher.test(path), path).toBe(true);
  }
}
