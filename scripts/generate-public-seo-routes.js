const fs = require('node:fs');
const path = require('node:path');
const { tokenizer } = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const MARKETING = 'apps/web/src/app/[locale]/(marketing)';
const OUTPUT = 'apps/web/src/lib/seo/public-routes.generated.json';
const HELPERS = new Set([
  'createMarketingMetadata',
  'createLocalizedMarketingMetadata',
  'getMarketingMetadata',
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function hasRedirect(source) {
  return /\b(?:redirect|permanentRedirect)\s*\(/u.test(source);
}

function getMetadataConfigs(source) {
  const configs = [];
  // Tokenize only each helper's object literal: Acorn skips comments and quoted
  // text while retaining nesting, without requiring a TS/JSX compiler at build.
  const pattern =
    /\b(createMarketingMetadata|createLocalizedMarketingMetadata|getMarketingMetadata)\s*\(\s*(?=\{)/gu;
  for (const match of source.matchAll(pattern)) {
    if (!HELPERS.has(match[1])) continue;
    const tokens = tokenizer(source.slice(match.index + match[0].length), {
      ecmaVersion: 'latest',
    });
    let depth = 0;
    const properties = new Map();
    let key = null;
    let expectingValue = false;
    for (;;) {
      const token = tokens.getToken();
      const label = token.type.label;
      if (label === 'eof') break;
      if (['{', '[', '('].includes(label)) depth += 1;
      if (['}', ']', ')'].includes(label)) depth -= 1;
      if (depth === 0) break;
      if (depth !== 1) continue;
      if (label === ',') {
        key = null;
        expectingValue = false;
      } else if (label === ':') expectingValue = true;
      else if (expectingValue) {
        properties.set(key, { label, value: token.value });
        expectingValue = false;
      } else if (label === 'name' || label === 'string') key = token.value;
    }
    const indexable = properties.get('indexable');
    const pathname = properties.get('pathname');
    if (pathname?.label === 'string')
      configs.push({
        pathname: pathname.value,
        indexable: !indexable || indexable.label === 'true',
      });
  }
  return configs;
}

function getMetadataPaths(source) {
  return getMetadataConfigs(source)
    .filter((config) => config.indexable)
    .map((config) => config.pathname);
}

function discoverRoutes(root = ROOT) {
  const directory = path.join(root, MARKETING);
  const routes = new Set();
  for (const page of walk(directory).filter(
    (file) => path.basename(file) === 'page.tsx'
  )) {
    const segments = path
      .relative(directory, path.dirname(page))
      .split(path.sep)
      .filter((segment) => segment && !segment.startsWith('('));
    // Dynamic user content needs a separate, publication-aware reader.
    if (segments.some((segment) => segment.includes('['))) continue;
    const pathname = `/${segments.join('/')}`;
    const source = fs.readFileSync(page, 'utf8');
    if (hasRedirect(source)) continue;
    const layout = path.join(path.dirname(page), 'layout.tsx');
    const hasPageMetadata =
      /\bexport\s+(?:(?:async\s+)?function|const)\s+generateMetadata\b/u.test(
        source
      );
    const metadataSource = hasPageMetadata
      ? source
      : fs.existsSync(layout)
        ? fs.readFileSync(layout, 'utf8')
        : '';
    const configs = getMetadataConfigs(metadataSource).filter(
      (config) => config.pathname === pathname
    );
    if (configs.length && configs.every((config) => config.indexable))
      routes.add(pathname);
  }
  return [...routes].sort();
}

function generate({ root = ROOT, check = false } = {}) {
  const routes = discoverRoutes(root);
  const output = path.join(root, OUTPUT);
  const content = `${JSON.stringify(routes, null, 2)}\n`;
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
      throw new Error(
        'Public SEO routes are stale. Run node scripts/generate-public-seo-routes.js.'
      );
    }
    for (const name of ['sitemap.xml', 'robots.txt']) {
      if (fs.existsSync(path.join(root, 'apps/web/public', name))) {
        throw new Error(
          `Remove conflicting public/${name}; src/app owns this metadata route.`
        );
      }
    }
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content)
      fs.writeFileSync(output, content);
  }
  return routes;
}

if (require.main === module) {
  try {
    console.log(
      `Public SEO manifest: ${generate({ check: process.argv.includes('--check') }).length} routes.`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const publicSeoCheck = {
  name: 'public-seo-routes',
  command: 'node',
  args: ['scripts/generate-public-seo-routes.js', '--check'],
  parseOutput: () => 'Public sitemap routes match indexable page metadata',
};

module.exports = {
  publicSeoCheck,
  discoverRoutes,
  generate,
  getMetadataPaths,
  hasRedirect,
};
