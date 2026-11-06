import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import manifest from '../../../scripts/tanstack-migration-manifest.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const framework =
  /^(?:next(?:\/|$)|next-intl(?:\/|$)|next-themes$|cookies-next(?:\/|$)|nuqs(?:\/|$))|^@tuturuuu\/[^/]+\/next(?:\/|$)/;

function hasDirective(node, directive) {
  return (
    node.directives?.some((item) => item.value.value === directive) ?? false
  );
}

function bindingNames(node) {
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'AssignmentPattern') return bindingNames(node.left);
  if (node.type === 'RestElement') return bindingNames(node.argument);
  if (node.type === 'ArrayPattern')
    return node.elements.flatMap((item) => (item ? bindingNames(item) : []));
  if (node.type === 'ObjectPattern')
    return node.properties.flatMap((item) =>
      bindingNames(item.type === 'RestElement' ? item.argument : item.value)
    );
  return [];
}

// Parse source without importing application code or executing a provider call.
export function inspectModule(file, source) {
  const { program } = parse(source, {
    sourceFilename: file,
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
    createImportExpressions: true,
  });
  const imports = [];
  const exports = [];
  const actions = [];
  const line = (node) => node.loc.start.line;
  for (const statement of program.body) {
    if (
      statement.type === 'ImportDeclaration' ||
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportAllDeclaration'
    ) {
      if (statement.source)
        imports.push({
          module: statement.source.value,
          line: line(statement),
          typeOnly:
            statement.importKind === 'type' || statement.exportKind === 'type',
        });
    }
    if (
      statement.type !== 'ExportNamedDeclaration' ||
      statement.exportKind === 'type'
    )
      continue;
    exports.push(
      ...statement.specifiers
        .filter((item) => item.exportKind !== 'type')
        .map((item) => item.exported.name ?? item.exported.value)
    );
    const declaration = statement.declaration;
    if (declaration?.type === 'FunctionDeclaration')
      exports.push(declaration.id.name);
    if (declaration?.type === 'VariableDeclaration')
      exports.push(
        ...declaration.declarations.flatMap((item) => bindingNames(item.id))
      );
  }
  if (hasDirective(program, 'use server'))
    actions.push({
      kind: 'file',
      line: program.directives.find((item) => item.value.value === 'use server')
        .loc.start.line,
      exports: [...new Set(exports)].sort(),
    });
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'BlockStatement' && hasDirective(node, 'use server'))
      actions.push({
        kind: 'inline',
        line: line(node),
        name: parent?.id?.name ?? null,
      });
    const argument =
      node.type === 'ImportExpression'
        ? node.source
        : node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            node.callee.name === 'require'
          ? node.arguments[0]
          : undefined;
    if (argument?.type === 'StringLiteral')
      imports.push({
        module: argument.value,
        line: line(node),
        typeOnly: false,
      });
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(child)) {
        for (const item of child) visit(item, node);
      } else if (child && typeof child === 'object') visit(child, node);
    }
  }
  visit(program);
  return {
    sha256: createHash('sha256').update(source).digest('hex'),
    client: hasDirective(program, 'use client'),
    imports,
    exports: [...new Set(exports)].sort(),
    actions,
  };
}

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.name === '__tests__') return [];
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Source symlink requires explicit inventory: ${file}`);
      if (entry.isDirectory()) return sources(file);
      return /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(?:d|test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
        ? [file]
        : [];
    });
}

export function inventoryApp(app, root = repository) {
  if (!['finance', 'pay'].includes(app))
    throw new Error('Expected finance or pay');
  const sourceRoot = join(root, 'apps', app, 'src');
  const modules = sources(sourceRoot).map((file) => ({
    file: relative(root, file).split('\\').join('/'),
    ...inspectModule(file, readFileSync(file, 'utf8')),
  }));
  const byFile = new Map(modules.map((module) => [module.file, module]));
  const routes = manifest
    .inventoryNextAppRoutes({
      appDir: join(sourceRoot, 'app'),
      rootDir: root,
      routeOverrides: new Map(),
    })
    .routes.map((route) => {
      const module = byFile.get(route.sourceFile);
      if (!module) throw new Error(`Missing route source: ${route.sourceFile}`);
      return {
        file: route.sourceFile,
        path: route.routePath,
        kind: route.kind,
        methods: module.exports.filter((name) => methods.includes(name)),
        sha256: module.sha256,
      };
    });
  const frameworkUse = modules.flatMap((module) =>
    module.imports
      .filter((item) => framework.test(item.module))
      .map((item) => ({ file: module.file, ...item }))
  );
  const serverActions = modules.flatMap((module) =>
    module.actions.map((action) => ({
      file: module.file,
      ...action,
      sha256: module.sha256,
    }))
  );
  return {
    generatedBy: 'apps/finance/migration/inventory.mjs',
    scope:
      'App source only; static import inventory, not a transitive graph or runtime acceptance.',
    app,
    summary: {
      modules: modules.length,
      pages: routes.filter((route) => route.kind === 'page').length,
      layouts: routes.filter((route) => route.kind === 'layout').length,
      handlers: routes.filter((route) => route.file.endsWith('/route.ts'))
        .length,
      serverActions: serverActions.length,
      frameworkImports: frameworkUse.length,
    },
    routes,
    serverActions,
    frameworkUse,
    workspaceImports: [
      ...new Set(
        modules.flatMap((module) =>
          module.imports
            .map((item) => item.module)
            .filter((name) => name.startsWith('@tuturuuu/'))
        )
      ),
    ].sort(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(
    JSON.stringify(inventoryApp(process.argv[2] ?? 'finance'), null, 2)
  );
}
