import { describe, expect, it } from 'vitest';
import {
  framablePathRegexes,
  TUTURUUU_DEFAULT_FRAMABLE_PATTERNS,
} from './framable-paths';
import { createTuturuuuNextConfig } from './next-config';

describe('framable paths', () => {
  const webgl = '/api/v1/workspaces/ws-1/external-projects/assets/a-1/webgl';

  it('matches the WebGL build path and nothing next to it', () => {
    const [pattern] = framablePathRegexes();
    for (const path of [webgl, `${webgl}/`, `${webgl}/Build/game.js`])
      expect(pattern?.test(path), path).toBe(true);
    for (const path of [
      '/api/v1/workspaces/ws-1/external-projects/assets/a-1',
      `${webgl}x`,
      `/cms${webgl}`,
      '/api/v1/workspaces/ws-1/external-projects/assets/a-1/x/webgl',
    ])
      expect(pattern?.test(path), path).toBe(false);
  });

  it('is exactly the list next-config excludes from the anti-framing headers', async () => {
    const [antiFraming] = (await createTuturuuuNextConfig().headers?.()) ?? [];
    expect(antiFraming).toEqual({
      source: `/:path((?!${TUTURUUU_DEFAULT_FRAMABLE_PATTERNS.map(
        (pattern) => `${pattern}(?:/|$)`
      ).join('|')}).*)`,
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    });
    expect(antiFraming?.source).toBe(
      '/:path((?!api/v1/workspaces/[^/]+/external-projects/assets/[^/]+/webgl(?:/|$)).*)'
    );
  });

  it('documents the case difference with Next header matching', () => {
    // Next matches header sources case-insensitively; the bridge regexes are
    // case-sensitive. Harmless: central's route itself is case-sensitive, so
    // an upper-case variant never serves the sandboxed build.
    const [pattern] = framablePathRegexes();
    expect(pattern?.flags).toBe('u');
    expect(pattern?.test(webgl.toUpperCase())).toBe(false);
  });
});
