import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { marketingUiSources } from './marketing-css.mjs';
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
it('includes static, lazy, wildcard and transitive UI imports without unrelated components', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'marketing-css-test-'));
  directories.push(root);
  const app = resolve(root, 'apps/marketing');
  const ui = resolve(root, 'packages/ui');
  const shell = resolve(root, 'packages/marketing-shell/src');
  mkdirSync(shell, { recursive: true });
  mkdirSync(resolve(app, 'src'), { recursive: true });
  mkdirSync(resolve(ui, 'src/custom'), { recursive: true });
  writeFileSync(
    resolve(ui, 'package.json'),
    JSON.stringify({
      exports: {
        './button': { import: './src/button.tsx' },
        './sheet': './src/sheet.tsx',
        './custom/*': './src/custom/*.tsx',
      },
    })
  );
  writeFileSync(
    resolve(app, 'src/page.tsx'),
    "import { Button } from '@tuturuuu/ui/button'; const lazy = () => import('@tuturuuu/ui/custom/footer');"
  );
  writeFileSync(
    resolve(ui, 'src/button.tsx'),
    "export { Dialog } from './dialog';"
  );
  writeFileSync(resolve(ui, 'src/dialog.tsx'), 'export const Dialog = 1;');
  writeFileSync(
    resolve(ui, 'src/sheet.tsx'),
    "export { Dialog } from './dialog';"
  );
  writeFileSync(
    resolve(shell, 'mobile-menu.tsx'),
    "import { Sheet } from '@tuturuuu/ui/sheet';"
  );
  writeFileSync(
    resolve(ui, 'src/custom/footer.tsx'),
    'export const Footer = 1;'
  );
  writeFileSync(
    resolve(ui, 'src/unrelated-chart.tsx'),
    'export const Chart = 1;'
  );
  expect(marketingUiSources(app, ui)).toEqual(
    [
      'src/button.tsx',
      'src/custom/footer.tsx',
      'src/dialog.tsx',
      'src/sheet.tsx',
    ].map((path) => resolve(ui, path))
  );
});
