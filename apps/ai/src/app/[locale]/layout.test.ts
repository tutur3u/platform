import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AI locale layout', () => {
  it('keeps the translated version badge inside the intl provider', () => {
    const source = readFileSync(
      new URL('./layout.tsx', import.meta.url),
      'utf8'
    );
    const providerStart = source.indexOf('<NextIntlClientProvider>');
    const versionBadge = source.indexOf('<SatelliteVersionBadge');
    const providerEnd = source.indexOf('</NextIntlClientProvider>');

    expect(providerStart).toBeGreaterThan(-1);
    expect(versionBadge).toBeGreaterThan(providerStart);
    expect(providerEnd).toBeGreaterThan(versionBadge);
  });
});
