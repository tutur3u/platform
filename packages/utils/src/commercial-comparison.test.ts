import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPARISON_FEATURES } from './commercial-comparison';

describe('commercial inventory coverage', () => {
  it('represents every app directory and avoids duplicate feature identifiers', () => {
    const apps = readdirSync(resolve(__dirname, '../../../apps'), {
      withFileTypes: true,
    })
      .filter((item) => item.isDirectory() && !item.name.startsWith('.'))
      .map((item) => (item.name === 'web' ? 'platform' : item.name));
    const represented = new Set(COMPARISON_FEATURES.map((row) => row.app));
    expect(apps.filter((app) => !represented.has(app))).toEqual([]);
    expect(new Set(COMPARISON_FEATURES.map((row) => row.id)).size).toBe(
      COMPARISON_FEATURES.length
    );
  });
  it('does not sell privileged internal services or promise public Meet access', () => {
    for (const row of COMPARISON_FEATURES.filter(
      (row) => row.category === 'internal'
    ))
      expect(row.values).toEqual([
        'internal',
        'internal',
        'internal',
        'internal',
      ]);
    for (const row of COMPARISON_FEATURES.filter((row) => row.app === 'meet'))
      expect(row.values).toEqual(['preview', 'preview', 'preview', 'preview']);
  });
});
