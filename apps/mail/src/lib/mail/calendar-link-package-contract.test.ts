import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../../..');
const app = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'));
const api = JSON.parse(
  readFileSync(
    resolve(appRoot, '../../packages/internal-api/package.json'),
    'utf8'
  )
);
const files = [
  'src/app/[locale]/(dashboard)/[wsId]/mail-calendar-link.test.ts',
  'src/lib/mail/calendar-link-client.test.ts',
  'src/lib/mail/calendar-link-route.test.ts',
  'src/lib/mail/repository/calendar-links.test.ts',
];
function imports(file: string) {
  // Include static, dynamic and mock package references. No source-path alias may
  // turn an undeclared dependency or private helper into a public package entry.
  const source = readFileSync(resolve(appRoot, file), 'utf8');
  return Array.from(
    source.matchAll(
      /['"](@tuturuuu\/internal-api(?:\/[a-z0-9/-]+)?|@supabase\/supabase-js)['"]/gu
    ),
    (match) => match[1]!
  );
}
function requireDeclared(module: string) {
  const dependency = module.startsWith('@')
    ? module.split('/').slice(0, 2).join('/')
    : module.split('/')[0]!;
  if (!app.dependencies?.[dependency] && !app.devDependencies?.[dependency])
    throw new Error(`Undeclared Mail dependency: ${dependency}`);
  if (dependency === api.name) {
    const subpath = module.slice(api.name.length);
    if (!Object.hasOwn(api.exports, subpath ? `.${subpath}` : '.'))
      throw new Error(`Undeclared internal-api export: ${module}`);
  }
}
it.each(files)(
  'respects actual declared dependencies and exports in %s',
  (file) => {
    const modules = imports(file).filter(
      (module) =>
        module.startsWith('@tuturuuu/internal-api') ||
        module === '@supabase/supabase-js'
    );
    expect(modules.length).toBeGreaterThan(0);
    for (const module of modules)
      expect(() => requireDeclared(module)).not.toThrow();
  }
);
it('rejects the helper-only subpath even when a source runner could find its file', () => {
  expect(() =>
    requireDeclared('@tuturuuu/internal-api/mail-calendar-link')
  ).toThrow('Undeclared internal-api export');
});
