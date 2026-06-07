import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const miraDashboardClientSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/(dashboard)/components/mira-dashboard-client.tsx'
  ),
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

describe('[wsId] Mira dashboard client compile graph', () => {
  it('keeps workspace selector dependencies behind a dynamic split point', () => {
    for (const modulePath of [
      '@tanstack/react-query',
      '@tuturuuu/icons/lucide',
      '@tuturuuu/ui/button',
      '@tuturuuu/ui/command',
      '@tuturuuu/ui/popover',
      '@tuturuuu/utils/constants',
      'next-intl',
      '../../workspace-list-actions',
      './mira-chat-constants',
    ] as const) {
      expect(miraDashboardClientSource).not.toMatch(
        staticImportPattern(modulePath)
      );
    }

    expect(miraDashboardClientSource).toContain(
      "import('./mira-workspace-context-selector')"
    );
  });
});
