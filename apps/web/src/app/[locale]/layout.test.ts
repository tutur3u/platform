import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Web root layout', () => {
  it('streams public messages inside suspense while applying saved themes before paint', () => {
    const layoutSource = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );
    const providersSource = readFileSync(
      resolve(process.cwd(), 'src/components/providers.tsx'),
      'utf8'
    );

    expect(layoutSource).toMatch(
      /async function PublicClientProviders[\s\S]*getPublicClientMessages\(await getMessages\(\)\)[\s\S]*<NuqsAdapter>[\s\S]*<Providers messages=\{publicClientMessages\}>\{children\}<\/Providers>/
    );
    expect(layoutSource).toMatch(
      /<AppThemeProvider>\s*<Suspense>\s*<PublicClientProviders>\{children\}<\/PublicClientProviders>\s*<\/Suspense>\s*<\/AppThemeProvider>/
    );
    expect(providersSource).toMatch(
      /export function AppThemeProvider[\s\S]*<NextThemesProvider/
    );
    expect(providersSource).toMatch(
      /export function Providers[\s\S]*<QueryProvider>/
    );
  });
});
