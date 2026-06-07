import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const structureSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/structure.tsx'),
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

describe('[wsId] structure compile graph', () => {
  it('keeps sidebar preference data helpers behind async split points', () => {
    for (const modulePath of [
      '@tuturuuu/internal-api/users',
      '@tuturuuu/ui/sonner',
    ] as const) {
      expect(structureSource).not.toMatch(staticImportPattern(modulePath));
      expect(structureSource).toContain(`import('${modulePath}')`);
    }
  });

  it('does not pull the shared user-config hook into the workspace shell', () => {
    expect(structureSource).not.toMatch(
      staticImportPattern('@/hooks/use-user-config')
    );
  });
});
