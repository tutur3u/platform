import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/(dashboard)/page.tsx'
  ),
  {
    encoding: 'utf8',
  }
);

const forbiddenStaticImports = [
  '@tuturuuu/utils/user-helper',
  '@tuturuuu/utils/workspace-helper',
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

describe('[wsId] dashboard page compile graph', () => {
  it('keeps auth and workspace helper modules behind async split points', () => {
    for (const modulePath of forbiddenStaticImports) {
      expect(pageSource).not.toMatch(staticImportPattern(modulePath));
    }
  });

  it('loads the dashboard access helpers through async imports', () => {
    expect(pageSource).toContain("import('@tuturuuu/utils/user-helper')");
    expect(pageSource).toContain("import('@tuturuuu/utils/workspace-helper')");
  });
});
