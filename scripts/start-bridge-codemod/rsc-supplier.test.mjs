import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const bridge = createRequire(
  new URL('../../packages/start-bridge/package.json', import.meta.url)
);
const { parseAst } = await import(pathToFileURL(bridge.resolve('vite')).href);
const { transformDirectiveProxyExport, transformServerActionServer } =
  await import(
    pathToFileURL(bridge.resolve('@vitejs/plugin-rsc/transforms')).href
  );

for (const directive of ['use server', 'use client']) {
  test(`${directive} proxy excludes implementation and private imports`, () => {
    const source = `"${directive}";
import { privateValue } from './private-only.js';
export async function action() { return privateValue + 'PRIVATE_SENTINEL'; }`;
    const result = transformDirectiveProxyExport(parseAst(source), {
      directive,
      code: source,
      runtime: (name) => `reference(${JSON.stringify(name)})`,
    });
    assert.ok(result);
    assert.deepEqual(result.exportNames, ['action']);
    const output = result.output.toString();
    assert.match(output, /reference\("action"\)/u);
    assert.doesNotMatch(output, /PRIVATE_SENTINEL|private-only|privateValue/u);
  });
}

test('ordinary modules do not become client or server references', () => {
  const source = 'export const value = 42;';
  assert.equal(
    transformDirectiveProxyExport(parseAst(source), {
      directive: 'use client',
      code: source,
      runtime: () => 'reference()',
    }),
    undefined
  );
});

test('server action transform registers the exported async implementation', () => {
  const source = '"use server"; export async function action() { return 42; }';
  const result = transformServerActionServer(source, parseAst(source), {
    runtime: (value, name) => `register(${value}, ${JSON.stringify(name)})`,
    rejectNonAsyncFunction: true,
  });
  assert.match(result.output.toString(), /register\(action, "action"\)/u);
  assert.match(result.output.toString(), /return 42/u);
});
