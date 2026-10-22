import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parse } from 'acorn';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object') walk(value, visit);
  }
}
function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
}
const requireName = /^(?:__)?require(?:\$?\d+)?$/u;
const specifierName = (node) => node.name ?? node.value;
const requireNamed = (callee) =>
  callee.type === 'Identifier' && requireName.test(callee.name);

function isHelperCall(module, callee) {
  if (callee.type === 'Identifier') return module.names.has(callee.name);
  if (
    callee.type !== 'MemberExpression' ||
    callee.object.type !== 'Identifier' ||
    !module.namespaces.has(callee.object.name)
  )
    return false;
  const supplier = module.namespaces.get(callee.object.name);
  const property = callee.computed
    ? staticString(callee.property)
    : callee.property.name;
  return property !== undefined && supplier.exports.has(property);
}

// Follow helper identity through imports and value-level named, star and
// namespace re-exports until no binding changes.
function resolveHelperBindings(modules) {
  let changed = true;
  const add = (set, value) => {
    if (set.has(value)) return;
    set.add(value);
    changed = true;
  };
  const link = (map, key, value) => {
    if (map.get(key) === value) return;
    map.set(key, value);
    changed = true;
  };
  while (changed) {
    changed = false;
    for (const [path, module] of modules) {
      const supplierOf = (source) =>
        typeof source === 'string'
          ? modules.get(resolve(dirname(path), source))
          : undefined;
      for (const node of module.ast.body) {
        if (node.type === 'ImportDeclaration') {
          const supplier = supplierOf(node.source.value);
          if (!supplier) continue;
          for (const specifier of node.specifiers) {
            const imported =
              specifier.type === 'ImportDefaultSpecifier'
                ? 'default'
                : specifier.type === 'ImportSpecifier'
                  ? specifierName(specifier.imported)
                  : undefined;
            if (specifier.type === 'ImportNamespaceSpecifier')
              link(module.namespaces, specifier.local.name, supplier);
            else if (supplier.exports.has(imported))
              add(module.names, specifier.local.name);
            else if (supplier.namespaceExports.has(imported))
              link(
                module.namespaces,
                specifier.local.name,
                supplier.namespaceExports.get(imported)
              );
          }
        } else if (node.type === 'ExportNamedDeclaration') {
          const supplier = node.source && supplierOf(node.source.value);
          for (const specifier of node.specifiers) {
            const local = specifierName(specifier.local);
            const exported = specifierName(specifier.exported);
            if (node.source) {
              if (supplier?.exports.has(local)) add(module.exports, exported);
              else if (supplier?.namespaceExports.has(local))
                link(
                  module.namespaceExports,
                  exported,
                  supplier.namespaceExports.get(local)
                );
            } else if (module.names.has(local) || requireName.test(local))
              add(module.exports, exported);
            else if (module.namespaces.has(local))
              link(
                module.namespaceExports,
                exported,
                module.namespaces.get(local)
              );
          }
        } else if (node.type === 'ExportAllDeclaration') {
          const supplier = supplierOf(node.source.value);
          if (!supplier) continue;
          if (node.exported)
            link(
              module.namespaceExports,
              specifierName(node.exported),
              supplier
            );
          else {
            for (const name of supplier.exports) add(module.exports, name);
            for (const [name, target] of supplier.namespaceExports)
              link(module.namespaceExports, name, target);
          }
        }
      }
    }
  }
}

export function assertMailNodeImports(dist, app, files) {
  if (app !== 'mail') return;
  const modules = new Map();
  for (const file of files) {
    if (!file.startsWith('server/') || !/\.(?:[cm]?js)$/u.test(file)) continue;
    const path = resolve(dist, file);
    const code = readFileSync(path, 'utf8');
    // Retain the conservative byte check, including require examples in diagnostics.
    for (const [, , name] of code.matchAll(
      /\b(?:__)?require(?:\$?\d+)?\s*\(\s*(['"`])([^'"`]+)\1\s*\)/gu
    ))
      assert.ok(
        !isBuiltin(name),
        `Mail Worker contains a CommonJS Node builtin require: ${file} (${name})`
      );
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const names = new Set();
    walk(ast, (node) => {
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'Identifier' &&
        node.init &&
        code
          .slice(node.init.start, node.init.end)
          .includes(
            'https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'
          )
      )
        names.add(node.id.name);
    });
    modules.set(path, {
      file,
      ast,
      names,
      exports: new Set(),
      namespaces: new Map(),
      namespaceExports: new Map(),
    });
  }
  resolveHelperBindings(modules);
  for (const module of modules.values()) {
    walk(module.ast, (node) => {
      if (node.type !== 'CallExpression') return;
      const helper = isHelperCall(module, node.callee);
      if (!helper && !requireNamed(node.callee)) return;
      const name = staticString(node.arguments[0]);
      // A proven Rolldown helper throws for any computed specifier as well.
      assert.ok(
        name === undefined ? !helper : !isBuiltin(name),
        `Mail Worker contains a CommonJS Node builtin require: ${module.file} (${name ?? 'computed'})`
      );
    });
  }
}
