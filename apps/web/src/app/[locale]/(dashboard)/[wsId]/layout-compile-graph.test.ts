import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/layout.tsx'),
  {
    encoding: 'utf8',
  }
);

const forbiddenStaticImports = [
  '../../navbar-actions',
  '../../user-nav',
  './dashboard-client-providers',
  './dashboard-settings-dialog-host',
  './navigation',
  './navigation-visibility',
  './structure',
] as const;

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('[wsId] layout compile graph', () => {
  it('keeps heavy dashboard shell modules out of static layout imports', () => {
    for (const modulePath of forbiddenStaticImports) {
      expect(layoutSource).not.toMatch(staticImportPattern(modulePath));
    }
  });

  it('loads dashboard navigation through an async split point', () => {
    expect(layoutSource).toContain("import('./navigation')");
    expect(layoutSource).toContain("import('./navigation-visibility')");
  });
});
