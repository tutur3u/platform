import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const manifestSchema = z.object({
  exports: z.unknown().optional(),
  source: z.string().optional(),
});
function sourceFile(path: string) {
  const stem = path.replace(/\.[cm]?js$/u, '');
  return [
    path,
    ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'].map(
      (ext) => `${stem}${ext}`
    ),
  ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
function exportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const conditions = z.record(z.string(), z.unknown()).safeParse(value);
  if (!conditions.success) return null;
  for (const key of ['bun', 'source', 'import', 'default']) {
    const target = exportTarget(conditions.data[key]);
    if (target) return target;
  }
  return null;
}

export function sourceResolver(repo: string) {
  const manifests = new Map<string, z.infer<typeof manifestSchema>>();
  return (specifier: string, importer: string): string | undefined => {
    if (specifier.startsWith('.'))
      return sourceFile(resolve(dirname(importer), specifier));
    if (specifier.startsWith('@/'))
      return sourceFile(resolve(repo, 'apps/contacts/src', specifier.slice(2)));
    if (!specifier.startsWith('@tuturuuu/')) return;
    const [name, ...parts] = specifier.slice('@tuturuuu/'.length).split('/');
    const root = resolve(repo, 'packages', name ?? '');
    const manifestPath = resolve(root, 'package.json');
    if (!existsSync(manifestPath)) return;
    let manifest = manifests.get(root);
    if (!manifest) {
      manifest = manifestSchema.parse(
        JSON.parse(readFileSync(manifestPath, 'utf8'))
      );
      manifests.set(root, manifest);
    }
    const subpath = parts.length ? `./${parts.join('/')}` : '.';
    const exports = z
      .record(z.string(), z.unknown())
      .safeParse(manifest.exports);
    let target = exports.success
      ? exportTarget(exports.data[subpath])
      : exportTarget(manifest.exports);
    if (!target && exports.success) {
      for (const [pattern, value] of Object.entries(exports.data)) {
        const [prefix, suffix] = pattern.split('*');
        if (
          suffix === undefined ||
          !prefix ||
          !subpath.startsWith(prefix) ||
          !subpath.endsWith(suffix)
        )
          continue;
        target =
          exportTarget(value)?.replace(
            '*',
            subpath.slice(prefix.length, suffix ? -suffix.length : undefined)
          ) ?? null;
        if (target) break;
      }
    }
    if (!target && subpath === '.') target = manifest.source ?? null;
    if (!target) return;
    // Published packages often export dist; this is a source census, not a
    // claim that the retained build artifacts are available to Vite.
    return sourceFile(resolve(root, target.replace(/^\.\/dist\//u, './src/')));
  };
}
