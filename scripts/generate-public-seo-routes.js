const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_PAGES = 'apps/web/src/app/[locale]';
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

function parseSource(source) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
}

function hasMetadataExport(source) {
  const names = new Set(['metadata', 'generateMetadata']);
  return parseSource(source).program.body.some((node) => {
    // A star re-export may supply metadata; never inherit an indexed layout.
    if (node.type === 'ExportAllDeclaration') return true;
    if (node.type !== 'ExportNamedDeclaration') return false;
    if (
      node.specifiers.some((specifier) =>
        names.has(specifier.exported?.name ?? specifier.exported?.value)
      )
    )
      return true;
    const declaration = node.declaration;
    if (names.has(declaration?.id?.name)) return true;
    return (
      declaration?.type === 'VariableDeclaration' &&
      declaration.declarations.some((entry) => names.has(entry.id?.name))
    );
  });
}

function metadataDeclarationSource(source) {
  const exports = parseSource(source).program.body.filter((node) =>
    node.type.startsWith('Export')
  );
  // Unknown, static or re-exported metadata cannot establish indexing.
  if (
    exports.some(
      (node) =>
        node.type === 'ExportAllDeclaration' ||
        node.specifiers?.some((specifier) =>
          ['metadata', 'generateMetadata'].includes(
            specifier.exported?.name ?? specifier.exported?.value
          )
        )
    )
  )
    return '';
  const declarations = exports.flatMap((node) => {
    const declaration = node.declaration;
    if (declaration?.id?.name === 'generateMetadata') return [declaration];
    if (declaration?.type !== 'VariableDeclaration') return [];
    return declaration.declarations.filter(
      (entry) => entry.id?.name === 'generateMetadata'
    );
  });
  if (
    exports.some((node) =>
      node.declaration?.declarations?.some(
        (entry) => entry.id?.name === 'metadata'
      )
    )
  )
    return '';
  return declarations
    .map((node) => source.slice(node.start, node.end))
    .join('\n');
}

function calls(source) {
  const ast = parseSource(source);
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') result.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return result;
}

function hasRedirect(source) {
  return calls(source).some(
    (call) =>
      call.callee.type === 'Identifier' &&
      ['redirect', 'permanentRedirect'].includes(call.callee.name)
  );
}

function getMetadataConfigs(source) {
  return calls(source).flatMap((call) => {
    if (call.callee.type !== 'Identifier' || !HELPERS.has(call.callee.name))
      return [];
    const options = call.arguments[0];
    if (options?.type !== 'ObjectExpression') return [];
    // Unknown spreads/computed properties can override indexing. Fail closed.
    if (
      options.properties.some(
        (property) => property.type !== 'ObjectProperty' || property.computed
      )
    )
      return [];
    const properties = new Map(
      options.properties.map((property) => [
        property.key.name ?? property.key.value,
        property.value,
      ])
    );
    const pathname = properties.get('pathname');
    const indexable = properties.get('indexable');
    if (pathname?.type !== 'StringLiteral') return [];
    return [
      {
        pathname: pathname.value,
        indexable:
          !indexable ||
          (indexable.type === 'BooleanLiteral' && indexable.value === true),
      },
    ];
  });
}

function getMetadataPaths(source) {
  return getMetadataConfigs(source)
    .filter((config) => config.indexable)
    .map((config) => config.pathname);
}

function discoverRoutes(root = ROOT) {
  const directory = path.join(root, PUBLIC_PAGES);
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
    const hasPageMetadata = hasMetadataExport(source);
    const metadataSource = hasPageMetadata
      ? metadataDeclarationSource(source)
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
