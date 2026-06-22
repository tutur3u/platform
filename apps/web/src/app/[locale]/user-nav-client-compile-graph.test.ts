import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const userNavClientSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/user-nav-client.tsx'),
  {
    encoding: 'utf8',
  }
);
const userNavClientRuntimeSource = userNavClientSource.replace(
  /^\s*import\s+type\b[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gmu,
  ''
);

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[^\n]*\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('user nav client compile graph', () => {
  it('does not preload the settings dialog through next/dynamic', () => {
    expect(userNavClientRuntimeSource).not.toMatch(
      staticImportPattern('./user-nav-settings-dialog')
    );
    expect(userNavClientSource).not.toContain(
      'const UserNavSettingsDialog = dynamic('
    );
    expect(userNavClientSource).toMatch(
      /import\(["']\.\/user-nav-settings-dialog["']\)/u
    );
    expect(userNavClientSource).toContain('useUserNavSettingsDialogComponent');
    expect(userNavClientSource).toContain('SettingsDialogFullscreenSkeleton');
  });
});
