import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Web root layout', () => {
  it('renders the theme provider outside suspense so saved themes apply before paint', () => {
    const layoutSource = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );
    const providersSource = readFileSync(
      resolve(process.cwd(), 'src/components/providers.tsx'),
      'utf8'
    );

    expect(layoutSource).toMatch(
      /<AppThemeProvider>\s*<Suspense>\s*<NuqsAdapter>\s*<Providers messages=\{publicClientMessages\}>\s*\{children\}\s*<\/Providers>\s*<\/NuqsAdapter>\s*<\/Suspense>\s*<\/AppThemeProvider>/
    );
    expect(providersSource).toMatch(
      /export function AppThemeProvider[\s\S]*<NextThemesProvider/
    );
    expect(providersSource).toMatch(
      /export function Providers[\s\S]*<QueryProvider>/
    );
  });
});
