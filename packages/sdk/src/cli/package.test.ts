import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('CLI package metadata', () => {
  it('exposes ttr as the primary command with tuturuuu and tutur3u aliases', () => {
    expect(packageJson.bin).toEqual({
      ttr: './bin/ttr.cjs',
      tuturuuu: './bin/ttr.cjs',
      tutur3u: './bin/ttr.cjs',
    });
  });

  it('routes the workspace ttr script through the trusted global CLI', () => {
    expect(packageJson.scripts.ttr).toBe('node ../../scripts/trusted-ttr.js');
  });
});
