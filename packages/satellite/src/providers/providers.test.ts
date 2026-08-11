import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const providers = readFileSync(
  resolve(process.cwd(), 'src/providers/providers.tsx'),
  'utf8'
);

describe('satellite provider prerender boundaries', () => {
  it('keeps theme hydration static while suspending request-aware intl data', () => {
    const themeProvider = providers.indexOf('<ThemeProvider');
    const suspense = providers.indexOf('<Suspense fallback={null}>');
    const intlProvider = providers.indexOf('<NextIntlClientProvider>');
    const clientProviders = providers.indexOf('<ClientProviders');
    const suspenseEnd = providers.lastIndexOf('</Suspense>');
    const themeProviderEnd = providers.indexOf('</ThemeProvider>');

    expect(themeProvider).toBeGreaterThan(-1);
    expect(themeProvider).toBeLessThan(suspense);
    expect(suspense).toBeLessThan(intlProvider);
    expect(intlProvider).toBeLessThan(clientProviders);
    expect(clientProviders).toBeLessThan(suspenseEnd);
    expect(suspenseEnd).toBeLessThan(themeProviderEnd);
  });
});
