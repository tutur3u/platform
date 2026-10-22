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
    const exports = new Set();
    for (const node of ast.body) {
      if (node.type !== 'ExportNamedDeclaration') continue;
      for (const specifier of node.specifiers)
        if (
          names.has(specifier.local.name) ||
          requireName.test(specifier.local.name)
        )
          exports.add(specifier.exported.name ?? specifier.exported.value);
    }
    modules.set(path, { file, ast, names, exports });
  }
  for (const [path, module] of modules) {
    for (const node of module.ast.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const supplier = modules.get(resolve(dirname(path), node.source.value));
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          supplier?.exports.has(
            specifier.imported.name ?? specifier.imported.value
          )
        )
          module.names.add(specifier.local.name);
      }
    }
    walk(module.ast, (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        !(
          requireName.test(node.callee.name) ||
          module.names.has(node.callee.name)
        )
      )
        return;
      const name = staticString(node.arguments[0]);
      assert.ok(
        !name || !isBuiltin(name),
        `Mail Worker contains a CommonJS Node builtin require: ${module.file} (${name})`
      );
    });
  }
}
