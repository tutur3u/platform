const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATHS = [
  ':(glob)apps/*/src/app/api/**/route.[jt]s',
  ':(glob)apps/*/src/legacy-api-routes/**/route.[jt]s',
  'apps/web/src/lib/meet/stream.ts',
  'packages/sdk/src/platform.ts',
  'packages/sdk/src/epm.ts',
  'packages/sdk/src/storage.ts',
];
const FETCH_KEYS = new Set(['fetch', 'fetchImpl', 'fetcher', 'fetchFn']);

function propertyName(node, key) {
  if (key.type === 'StringLiteral') return key.value;
  if (key.type === 'PrivateName') return key.id.name;
  if (!node.computed && key.type === 'Identifier') return key.name;
  return undefined;
}

function hasRawFetch(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return node.name === 'fetch';
  if (node.type === 'MemberExpression') {
    return (
      node.object.type === 'Identifier' &&
      node.object.name === 'globalThis' &&
      propertyName(node, node.property) === 'fetch'
    );
  }
  if (node.type === 'LogicalExpression') {
    return hasRawFetch(node.left) || hasRawFetch(node.right);
  }
  if (node.type === 'ConditionalExpression') {
    return hasRawFetch(node.consequent) || hasRawFetch(node.alternate);
  }
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSSatisfiesExpression'
  ) {
    return hasRawFetch(node.expression);
  }
  return false;
}

function unsafeFetchReceivers(source, file) {
  const offenders = [];
  const plugins = file.endsWith('.ts') ? ['typescript'] : [];
  function record(node, key, value) {
    if (FETCH_KEYS.has(propertyName(node, key)) && hasRawFetch(value)) {
      offenders.push(node.loc.start.line);
    }
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') {
      for (const property of node.properties) {
        if (property.type === 'ObjectProperty') {
          record(property, property.key, property.value);
        }
      }
    }
    if (node.type === 'ClassProperty' || node.type === 'ClassPrivateProperty') {
      record(node, node.key, node.value);
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'ThisExpression'
    ) {
      record(node.left, node.left.property, node.right);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }
  visit(parse(source, { sourceType: 'unambiguous', plugins }));
  return offenders;
}

function main() {
  const result = spawnSync(
    'git',
    ['grep', '--untracked', '-l', '-z', '-w', 'fetch', '--', ...SOURCE_PATHS],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.error) throw result.error;
  if (result.status === 1) return;
  if (result.status !== 0) throw new Error('Could not inventory fetch sources');

  const offenders = result.stdout
    .split('\0')
    .filter(Boolean)
    .flatMap((file) =>
      unsafeFetchReceivers(
        readFileSync(path.join(ROOT, file), 'utf8'),
        file
      ).map((line) => `${file}:${line}`)
    );
  if (offenders.length > 0) {
    console.error(
      [
        'Bind global fetch to globalThis before storing it as a dependency or client method.',
        ...offenders,
      ].join('\n')
    );
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { unsafeFetchReceivers };
