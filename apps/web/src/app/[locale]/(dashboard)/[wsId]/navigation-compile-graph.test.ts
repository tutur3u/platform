import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const navigationSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/navigation.tsx'),
  {
    encoding: 'utf8',
  }
);

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

describe('[wsId] navigation compile graph', () => {
  it('keeps broad server helpers behind async split points', () => {
    for (const modulePath of [
      '@tuturuuu/supabase/next/server',
      '@tuturuuu/utils/workspace-helper',
      'next-intl/server',
    ] as const) {
      expect(navigationSource).not.toMatch(staticImportPattern(modulePath));
      expect(navigationSource).toContain(`import('${modulePath}')`);
    }
  });
});
