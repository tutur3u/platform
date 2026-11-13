import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : /\.[cm]?[jt]sx?$/u.test(path) && !/\.test\./u.test(path)
        ? [path]
        : [];
  });
}
function source(path) {
  return [
    path,
    `${path}.tsx`,
    `${path}.ts`,
    `${path}.jsx`,
    `${path}.js`,
    resolve(path, 'index.tsx'),
    resolve(path, 'index.ts'),
  ].find((candidate) => existsSync(candidate) && /\.[jt]sx?$/u.test(candidate));
}

/** Resolve the UI source graph used by every marketing route, including lazy imports. */
export function marketingUiSources(appRoot, uiRoot) {
  const exports = JSON.parse(
    readFileSync(resolve(uiRoot, 'package.json'), 'utf8')
  ).exports;
  const seen = new Set();
  const used = new Set();
  const shellRoot = resolve(appRoot, '../../packages/marketing-shell/src');
  const pending = [
    ...files(resolve(appRoot, 'src')),
    ...(existsSync(shellRoot) ? files(shellRoot) : []),
  ];
  while (pending.length) {
    const path = pending.pop();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (path.startsWith(`${uiRoot}${sep}`)) used.add(path);
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(
      /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/gu
    )) {
      const specifier = match[1];
      let target;
      if (specifier.startsWith('@tuturuuu/ui/')) {
        const key = `./${specifier.slice('@tuturuuu/ui/'.length)}`;
        let entry = exports[key];
        let replacement;
        if (!entry) {
          for (const pattern of Object.keys(exports)
            .filter((item) => item.includes('*'))
            .sort((a, b) => b.length - a.length)) {
            const [prefix, suffix] = pattern.split('*');
            if (key.startsWith(prefix) && key.endsWith(suffix)) {
              entry = exports[pattern];
              replacement = key.slice(
                prefix.length,
                suffix ? -suffix.length : undefined
              );
              break;
            }
          }
        }
        const value =
          typeof entry === 'string' ? entry : (entry?.import ?? entry?.default);
        if (value)
          target = source(
            resolve(
              uiRoot,
              replacement === undefined
                ? value
                : value.replaceAll('*', replacement)
            )
          );
      } else if (specifier.startsWith('.'))
        target = source(resolve(dirname(path), specifier));
      else if (specifier.startsWith('@/'))
        target = source(resolve(appRoot, 'src', specifier.slice(2)));
      if (target) pending.push(target);
    }
  }
  return [...used].sort();
}

/** Keep shared tokens/plugins, but scan only the UI components this app ships. */
export function marketingCssSources(
  appRoot = fileURLToPath(new URL('../', import.meta.url))
) {
  const uiRoot = resolve(appRoot, '../../packages/ui');
  const stylesheet = resolve(uiRoot, 'src/globals.css');
  return {
    name: 'marketing-css-sources',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== stylesheet) return;
      const sources = marketingUiSources(appRoot, uiRoot)
        .map(
          (path) =>
            `@source ${JSON.stringify(relative(dirname(stylesheet), path).split(sep).join('/'))};`
        )
        .join('\n');
      return {
        code: code
          .replace('@source "components";', sources)
          .replace(/^@source .*streamdown.*;\n/gmu, ''),
        map: null,
      };
    },
  };
}
