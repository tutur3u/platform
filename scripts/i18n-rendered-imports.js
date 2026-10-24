const fs = require('node:fs');
const path = require('node:path');

function sourceFile(candidate) {
  for (const suffix of [
    '',
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '/index.tsx',
    '/index.ts',
    '/index.js',
  ]) {
    const target = `${candidate}${suffix}`;
    if (
      /\.(?:[jt]sx?|mjs|cjs)$/.test(target) &&
      fs.existsSync(target) &&
      fs.statSync(target).isFile()
    )
      return target;
  }
  if (candidate.endsWith('.js'))
    return sourceFile(candidate.replace(/\.js$/, '.ts'));
  return null;
}

function exportTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return exportTarget(
    value.import ?? value.default ?? value.require ?? value.types
  );
}

function resolveImport(root, from, specifier) {
  if (specifier.startsWith('.'))
    return sourceFile(path.resolve(path.dirname(from), specifier));
  if (specifier.startsWith('@/')) {
    const owner = path
      .relative(root, from)
      .split(path.sep)
      .slice(0, 2)
      .join('/');
    return sourceFile(path.join(root, owner, 'src', specifier.slice(2)));
  }
  const match = /^@tuturuuu\/([^/]+)(.*)$/.exec(specifier);
  if (!match) return null;
  const dir = path.join(root, 'packages', match[1]);
  const manifest = path.join(dir, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const subpath = match[2] ? `.${match[2]}` : '.';
  let target = exportTarget(pkg.exports?.[subpath]);
  if (!target) {
    for (const key of Object.keys(pkg.exports ?? {}).sort(
      (a, b) => b.length - a.length
    )) {
      if (!key.includes('*')) continue;
      const [prefix, suffix] = key.split('*');
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
      const wildcard = subpath.slice(
        prefix.length,
        suffix ? -suffix.length : undefined
      );
      // Node substitutes every `*` in the target with the matched subpath.
      target = exportTarget(pkg.exports[key])?.replaceAll('*', () => wildcard);
      break;
    }
  }
  target ??= subpath === '.' ? (pkg.module ?? pkg.main) : null;
  if (!target) return null;
  // Published entrypoints map back to the source used by workspace builds.
  return sourceFile(path.join(dir, target.replace(/^\.\/dist\//, './src/')));
}

function collectRenderedFiles(root, app, scanImports) {
  const pending = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['api', '__tests__', 'node_modules'].includes(entry.name))
          walk(file);
      } else if (
        /\.[jt]sx?$/.test(file) &&
        !/\.(test|spec|d)\.[jt]sx?$/.test(file)
      )
        pending.push(file);
    }
  }
  walk(path.join(root, app, 'src/app'));
  const files = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const entry of scanImports(fs.readFileSync(file, 'utf8'), file)) {
      const resolved = resolveImport(root, file, entry.path);
      if (resolved) pending.push(resolved);
      else if (
        /^(?:\.|@\/|@tuturuuu\/)/.test(entry.path) &&
        !/\.(?:css|json|svg|png|woff2?)$/.test(entry.path)
      ) {
        throw new Error(
          `Cannot trace ${entry.path} from ${path.relative(root, file)}`
        );
      }
    }
  }
  return [...files].sort();
}

module.exports = { collectRenderedFiles, resolveImport };
