import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { Scanner } from '@tailwindcss/oxide';
import selectorParser from 'postcss-selector-parser';

export function criticalCss(css, source) {
  const candidates = new Set(
    new Scanner({}).scanFiles([{ content: source, extension: 'tsx' }])
  );
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/u.test(rule.parent.name))
      return;
    let needed = false;
    selectorParser((selectors) => {
      selectors.each((selector) => {
        const classes = [];
        selector.walkClasses((node) => classes.push(node.value));
        if (!classes.length || classes.every((name) => candidates.has(name)))
          needed = true;
      });
    }).processSync(rule.selector);
    if (!needed) rule.remove();
  });
  root.walkAtRules((rule) => {
    if (/keyframes$/u.test(rule.name) || (rule.nodes && !rule.nodes.length))
      rule.remove();
  });
  // Retain the transitive token graph, including variables used by inline hero styles.
  const references = (value) =>
    [...value.matchAll(/var\((--[\w-]+)/gu)].map((match) => match[1]);
  const used = new Set(references(source));
  const definitions = new Map();
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--'))
      definitions.set(decl.prop, [
        ...(definitions.get(decl.prop) ?? []),
        decl.value,
      ]);
    else references(decl.value).forEach((name) => used.add(name));
  });
  for (const name of used)
    for (const value of definitions.get(name) ?? [])
      references(value).forEach((reference) => used.add(reference));
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--') && !used.has(decl.prop)) decl.remove();
  });
  return root.toString();
}
export function remainingCss(css, critical) {
  const extracted = new Set();
  const first = postcss.parse(critical);
  first.walkRules((rule) => extracted.add(rule.toString()));
  first.walkAtRules((rule) => {
    if (['font-face', 'property'].includes(rule.name))
      extracted.add(rule.toString());
  });
  const rest = postcss.parse(css);
  rest.walkRules((rule) => {
    if (extracted.has(rule.toString())) rule.remove();
  });
  rest.walkAtRules((rule) => {
    if (extracted.has(rule.toString()) || (rule.nodes && !rule.nodes.length))
      rule.remove();
  });
  return rest.toString();
}
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = resolve(directory, item.name);
    return item.isDirectory()
      ? sources(path)
      : /\.[jt]sx?$/u.test(path) && !path.includes('.test.')
        ? [readFileSync(path, 'utf8')]
        : [];
  });
}
export function landingCriticalCss(appRoot) {
  const manifest = resolve(appRoot, 'dist/client/landing-styles.json');
  const mapping = {};
  const criticalAssets = new Map();
  return {
    name: 'landing-critical-css',
    resolveId(id) {
      if (id === 'virtual:landing-styles') return '\0landing-styles';
    },
    load(id) {
      if (id !== '\0landing-styles') return;
      if (this.environment.name === 'client') return 'export default {}';
      try {
        return `export default ${readFileSync(manifest, 'utf8')}`;
      } catch {
        return 'export default {}';
      }
    },
    generateBundle(_, bundle) {
      if (this.environment.name === 'ssr') return;
      const source = [
        ...sources(resolve(appRoot, 'src/components/landing/hero')),
        ...sources(resolve(appRoot, '../../packages/marketing-shell/src')),
        ...[
          'src/app/[locale]/layout.tsx',
          'src/components/landing/shared/atmosphere.tsx',
          'src/app/[locale]/(marketing)/(landing)/page.tsx',
          '../../packages/ui/src/components/ui/button.tsx',
          '../../packages/ui/src/components/ui/custom/theme-toggle.tsx',
        ].map((path) => readFileSync(resolve(appRoot, path), 'utf8')),
        'landing-lite marketing-fonts flex flex-col overflow-x-clip pt-20',
      ].join('\n');
      for (const asset of Object.values(bundle)) {
        if (
          asset.type !== 'asset' ||
          !/assets\/layout-[^/]+\.css$/u.test(asset.fileName)
        )
          continue;
        const css = criticalCss(String(asset.source), source);
        const hash = createHash('sha256')
          .update(css)
          .digest('hex')
          .slice(0, 12);
        const fileName = `assets/landing-critical-${hash}.css`;
        this.emitFile({ type: 'asset', fileName, source: css });
        const remaining = remainingCss(String(asset.source), css);
        const restName = `assets/landing-rest-${createHash('sha256').update(remaining).digest('hex').slice(0, 12)}.css`;
        mapping[`/${asset.fileName}`] = {
          critical: `/${fileName}`,
          remaining: `/${restName}`,
        };
        criticalAssets.set(restName, remaining);
        criticalAssets.set(fileName, css);
      }
      for (const [fileName, source] of criticalAssets) {
        if (!bundle[fileName])
          this.emitFile({ type: 'asset', fileName, source });
      }
      if (
        this.environment.name === 'client' &&
        Object.keys(mapping).length !== 1
      ) {
        throw new Error(
          'Expected exactly one marketing root stylesheet to split'
        );
      }
      this.emitFile({
        type: 'asset',
        fileName: 'landing-styles.json',
        source: JSON.stringify(mapping),
      });
    },
  };
}
