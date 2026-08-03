import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root layout query-state adapter', () => {
  it('mounts the Next nuqs adapter above shared satellite UI', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'layout.tsx'),
      'utf8'
    );
    const adapterStart = source.indexOf('<NuqsAdapter>');
    const providers = source.indexOf('<Providers>');
    const children = source.indexOf('{children}');
    const versionBadge = source.indexOf('<SatelliteVersionBadge');
    const adapterEnd = source.indexOf('</NuqsAdapter>');

    expect(source).toContain("from '@tuturuuu/ui/nuqs-adapter'");
    expect(adapterStart).toBeGreaterThan(-1);
    expect(adapterStart).toBeLessThan(providers);
    expect(adapterStart).toBeLessThan(children);
    expect(adapterStart).toBeLessThan(versionBadge);
    expect(adapterEnd).toBeGreaterThan(providers);
    expect(adapterEnd).toBeGreaterThan(children);
    expect(adapterEnd).toBeGreaterThan(versionBadge);
  });
});
