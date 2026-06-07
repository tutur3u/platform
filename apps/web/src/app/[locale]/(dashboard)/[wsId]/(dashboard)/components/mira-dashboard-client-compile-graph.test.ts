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
const miraDashboardClientRuntimeSource = miraDashboardClientSource.replace(
  /^\s*import\s+type\b[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gmu,
  ''
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
      './mira-chat-panel',
      './mira-chat-constants',
    ] as const) {
      expect(miraDashboardClientRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
    }

    expect(miraDashboardClientSource).toMatch(
      /import\(["']\.\/mira-workspace-context-selector["']\)/u
    );
  });

  it('loads the chat panel after hydration instead of preloading it through next/dynamic', () => {
    expect(miraDashboardClientSource).not.toContain(
      "dynamic(() => import('./mira-chat-panel')"
    );
    expect(miraDashboardClientSource).toMatch(
      /import\(["']\.\/mira-chat-panel["']\)/u
    );
    expect(miraDashboardClientSource).toContain('useMiraChatPanelComponent');
  });
});
