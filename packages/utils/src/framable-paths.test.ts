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

  it('is the list next-config excludes from the anti-framing headers', async () => {
    const headers = await createTuturuuuNextConfig().headers?.();
    const sources = (headers ?? []).map((rule) => rule.source).join('\n');
    for (const pattern of TUTURUUU_DEFAULT_FRAMABLE_PATTERNS)
      expect(sources).toContain(pattern);
  });
});
