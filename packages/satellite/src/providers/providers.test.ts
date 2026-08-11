import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/providers/providers.tsx', 'utf8');

describe('satellite providers', () => {
  it('keeps runtime i18n resolution inside suspense and theme setup outside', () => {
    const themeProvider = source.indexOf('<ThemeProvider');
    const suspense = source.indexOf('<Suspense fallback={null}>');
    const intlProvider = source.indexOf('<NextIntlClientProvider>');
    const intlProviderEnd = source.indexOf('</NextIntlClientProvider>');
    const suspenseEnd = source.lastIndexOf('</Suspense>');
    const themeProviderEnd = source.indexOf('</ThemeProvider>');

    expect(themeProvider).toBeGreaterThan(-1);
    expect(themeProvider).toBeLessThan(suspense);
    expect(suspense).toBeLessThan(intlProvider);
    expect(intlProvider).toBeLessThan(intlProviderEnd);
    expect(intlProviderEnd).toBeLessThan(suspenseEnd);
    expect(suspenseEnd).toBeLessThan(themeProviderEnd);
  });
});
