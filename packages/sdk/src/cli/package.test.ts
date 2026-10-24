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

  it('uses the trusted global ttr for workspace operations', () => {
    expect(packageJson.scripts.ttr).toBe('node ../../scripts/trusted-ttr.js');
  });
});
