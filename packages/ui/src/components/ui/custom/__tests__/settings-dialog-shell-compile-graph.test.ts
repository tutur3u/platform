import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const settingsDialogShellPath = [
  join(
    process.cwd(),
    'packages/ui/src/components/ui/custom/settings-dialog-shell.tsx'
  ),
  join(process.cwd(), 'src/components/ui/custom/settings-dialog-shell.tsx'),
].find((path) => existsSync(path));

if (!settingsDialogShellPath) {
  throw new Error('Unable to locate settings-dialog-shell.tsx');
}

const settingsDialogShellSource = readFileSync(settingsDialogShellPath, {
  encoding: 'utf8',
});
const settingsDialogSearchLoaderPath = [
  join(
    process.cwd(),
    'packages/ui/src/components/ui/custom/settings-dialog-search-loader.js'
  ),
  join(
    process.cwd(),
    'src/components/ui/custom/settings-dialog-search-loader.js'
  ),
].find((path) => existsSync(path));

if (!settingsDialogSearchLoaderPath) {
  throw new Error('Unable to locate settings-dialog-search-loader.js');
}

const settingsDialogSearchLoaderSource = readFileSync(
  settingsDialogSearchLoaderPath,
  {
    encoding: 'utf8',
  }
);
const runtimeSource = settingsDialogShellSource.replace(
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

// The satellite shell and its navigation hook sit on the same dialog-open path.
const shellGraphSources = [
  'satellite-settings-dialog-shell.tsx',
  'use-settings-dialog-navigation.ts',
].map((file) => {
  const path = settingsDialogShellPath.replace(
    'settings-dialog-shell.tsx',
    file
  );
  return {
    file,
    runtime: readFileSync(path, { encoding: 'utf8' }).replace(
      /^\s*import\s+type\b[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gmu,
      ''
    ),
  };
});

describe('settings dialog shell compile graph', () => {
  it.each(shellGraphSources)(
    'keeps the search engine out of the static graph of $file',
    ({ runtime }) => {
      expect(runtime).not.toMatch(
        staticImportPattern('./settings-dialog-search')
      );
      expect(runtime).not.toMatch(
        staticImportPattern('@tuturuuu/utils/text-helper')
      );
    }
  );

  it('keeps the settings search engine behind a dynamic import', () => {
    expect(runtimeSource).not.toMatch(
      staticImportPattern('./settings-dialog-search')
    );
    expect(runtimeSource).not.toMatch(
      staticImportPattern('@tuturuuu/utils/text-helper')
    );
    expect(settingsDialogSearchLoaderSource).toMatch(
      /import\(['"]\.\/settings-dialog-search['"]\)/u
    );
    expect(settingsDialogShellSource).not.toContain(
      'settings-dialog-search.js'
    );
    expect(settingsDialogSearchLoaderSource).not.toContain(
      'settings-dialog-search.js'
    );
  });
});
