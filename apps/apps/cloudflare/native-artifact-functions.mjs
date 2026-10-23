import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from '@babel/parser';

function staticString(node) {
  if (node.type === 'StringLiteral') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1 &&
    typeof node.quasis[0].value.cooked === 'string'
  ) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

export async function gatewayFunctionId(directory) {
  const ids = new Set();
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      assert.equal(
        metadata.isSymbolicLink(),
        false,
        'Runtime artifact cannot contain symlinks'
      );
      if (entry.isDirectory()) {
        await scan(path);
        continue;
      }
      if (!/\.[cm]?js$/.test(entry.name)) continue;
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
      let source;
      try {
        if (!(await file.stat()).isFile())
          throw new Error('Runtime artifact is not a regular file');
        source = await file.readFile('utf8');
      } finally {
        await file.close();
      }
      const ast = parse(source, { sourceType: 'unambiguous' });
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'ObjectExpression') {
          const values = new Map(
            node.properties
              .filter(
                (property) =>
                  property.type === 'ObjectProperty' &&
                  !property.computed &&
                  (property.key.type === 'Identifier' ||
                    property.key.type === 'StringLiteral') &&
                  typeof staticString(property.value) === 'string'
              )
              .map((property) => [
                property.key.name ?? property.key.value,
                staticString(property.value),
              ])
          );
          if (
            /src\/native\/page-data\.ts$/.test(values.get('filename') ?? '') &&
            (values.get('name') ?? '').startsWith('loadGateway')
          ) {
            assert.equal(typeof values.get('id'), 'string');
            ids.add(values.get('id'));
          }
        }
        for (const [key, value] of Object.entries(node)) {
          if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key))
            continue;
          if (Array.isArray(value)) {
            for (const child of value) visit(child);
          } else if (value && typeof value === 'object') visit(value);
        }
      }
      visit(ast);
    }
  }
  await scan(directory);
  assert.equal(
    ids.size,
    1,
    'Discover exactly the real compiler-emitted Apps server function; never fabricate an id'
  );
  return [...ids][0];
}
