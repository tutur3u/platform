import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gatewayFunctionId } from './native-artifact-functions.mjs';

// Exact 519-byte producer chunk from source 017078dc, artifact 12363205871.
const emitted = Buffer.from(
  'aW1wb3J0e2YgYXMgZSx0fWZyb20iLi9jcmVhdGVTZXJ2ZXJGbi1CZHBDcFF4MS5tanMiO3ZhciBuPSgodCxuKT0+e2xldCByPWAvX3NlcnZlckZuL2ArdC5pZDtyZXR1cm4gT2JqZWN0LmFzc2lnbihuLHt1cmw6cixzZXJ2ZXJGbk1ldGE6dCxbZV06ITB9KX0pKHtpZDpgNzYzMzNjZWQwNGU1ZDExYWE5NmM3YmY3MmQyOWZlOWI0OWVjYjA3OTFlYTc4YmUwMzgyMWVlOTU0OGY2ZWEzOWAsbmFtZTpgbG9hZEdhdGV3YXlgLGZpbGVuYW1lOmBzcmMvbmF0aXZlL3BhZ2UtZGF0YS50c2B9LGU9PnIuX19leGVjdXRlU2VydmVyKGUpKSxyPXQoe21ldGhvZDpgR0VUYH0pLmhhbmRsZXIobixhc3luYygpPT57bGV0e2xvYWRHYXRld2F5RGF0YTplfT1hd2FpdCBpbXBvcnQoYC4vcGFnZS1kYXRhLnNlcnZlci03NWFCeUdvXy5tanNgKTtyZXR1cm4gZSgpfSk7ZXhwb3J0e24gYXMgbG9hZEdhdGV3YXlfY3JlYXRlU2VydmVyRm5faGFuZGxlcn07Ci8vIyBzb3VyY2VNYXBwaW5nVVJMPXBhZ2UtZGF0YS1Cd0ZuT1UtRS5tanMubWFw',
  'base64'
);
const expectedId =
  '76333ced04e5d11aa96c7bf72d29fe9b49ecb0791ea78be03821ee9548f6ea39';
const fixtureHash =
  '28791133dbed61f98de40e40702871d23713b1d596440241f9c64916efd65543';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'apps-function-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('actual sealed compiler chunk discovers its exact emitted gateway ID', async (t) => {
  assert.equal(emitted.byteLength, 519);
  assert.equal(createHash('sha256').update(emitted).digest('hex'), fixtureHash);
  const root = await directory(t);
  await writeFile(join(root, 'page-data-BwFnOU-E.mjs'), emitted);
  assert.equal(await gatewayFunctionId(root), expectedId);
});

function metadata({
  id = JSON.stringify(expectedId),
  name = '"loadGateway"',
  filename = '"src/native/page-data.ts"',
} = {}) {
  return `const metadata = { id: ${id}, name: ${name}, filename: ${filename} };`;
}

for (const extension of ['js', 'mjs', 'cjs']) {
  test(`existing string literal metadata remains discoverable in .${extension}`, async (t) => {
    const root = await directory(t);
    await writeFile(join(root, `metadata.${extension}`), metadata());
    assert.equal(await gatewayFunctionId(root), expectedId);
  });
}

test('quoted keys, mixed literal forms and cooked escapes retain their static meanings', async (t) => {
  const root = await directory(t);
  await writeFile(
    join(root, 'metadata.mjs'),
    `const metadata = { "id": ${JSON.stringify(expectedId)}, "name": \`loadGateway\`, "filename": \`src/native/page-data\\u002ets\` };`
  );
  assert.equal(await gatewayFunctionId(root), expectedId);
});

function interpolated(prefix, value, suffix = '') {
  return `\`${prefix}\${${JSON.stringify(value)}}${suffix}\``;
}

for (const [label, fields] of [
  ['interpolated id', { id: interpolated('opaque-', 'suffix') }],
  ['interpolated name', { name: interpolated('load', 'Gateway') }],
  [
    'interpolated filename',
    { filename: interpolated('src/native/', 'page-data', '.ts') },
  ],
  ['tagged id', { id: 'tag`opaque`' }],
  ['tagged name', { name: 'tag`loadGateway`' }],
  ['tagged filename', { filename: 'tag`src/native/page-data.ts`' }],
  ['dynamic id', { id: 'resolveId()' }],
  ['dynamic name', { name: 'resolveName()' }],
  ['dynamic filename', { filename: 'resolveFilename()' }],
  ['concatenated id', { id: '"first" + "second"' }],
  ['numeric id', { id: '42' }],
  ['null id', { id: 'null' }],
  ['boolean id', { id: 'true' }],
  ['object id', { id: '{}' }],
  ['wrong filename', { filename: '"src/native/other.ts"' }],
  ['query-suffixed filename', { filename: '"src/native/page-data.ts?split"' }],
  ['wrong name', { name: '"otherGateway"' }],
]) {
  test(`unsupported ${label} cannot supply a gateway ID`, async (t) => {
    const root = await directory(t);
    await writeFile(join(root, 'metadata.mjs'), metadata(fields));
    await assert.rejects(gatewayFunctionId(root), { code: 'ERR_ASSERTION' });
  });
}

for (const [label, source] of [
  [
    'identifier alias',
    `const id = ${JSON.stringify(expectedId)}; ${metadata({ id: 'id' })}`,
  ],
  [
    'shorthand',
    `const id = ${JSON.stringify(expectedId)}; const name = 'loadGateway'; const filename = 'src/native/page-data.ts'; const metadata = { id, name, filename };`,
  ],
  [
    'object method',
    `const metadata = { id() { return ${JSON.stringify(expectedId)}; }, name: 'loadGateway', filename: 'src/native/page-data.ts' };`,
  ],
  [
    'spread',
    `const fields = { id: ${JSON.stringify(expectedId)} }; const metadata = { ...fields, name: 'loadGateway', filename: 'src/native/page-data.ts' };`,
  ],
]) {
  test(`${label} metadata remains unevaluated`, async (t) => {
    const root = await directory(t);
    await writeFile(join(root, 'metadata.mjs'), source);
    await assert.rejects(gatewayFunctionId(root), { code: 'ERR_ASSERTION' });
  });
}

test('zero candidates and two distinct matching IDs both fail closed', async (t) => {
  const root = await directory(t);
  await assert.rejects(
    gatewayFunctionId(root),
    (error) => error.actual === 0 && error.expected === 1
  );
  await writeFile(join(root, 'actual.mjs'), emitted);
  await writeFile(
    join(root, 'ambiguous.mjs'),
    metadata({ id: JSON.stringify(`${expectedId}-ambiguous`) })
  );
  await assert.rejects(
    gatewayFunctionId(root),
    (error) => error.actual === 2 && error.expected === 1
  );
});

test('repeated copies of the same static ID remain one distinct candidate', async (t) => {
  const root = await directory(t);
  await writeFile(join(root, 'actual.mjs'), emitted);
  await mkdir(join(root, 'nested'));
  await writeFile(join(root, 'nested', 'same.cjs'), metadata());
  assert.equal(await gatewayFunctionId(root), expectedId);
});

test('conflicting source maps never supply, override or disambiguate an ID', async (t) => {
  const root = await directory(t);
  await writeFile(
    join(root, 'actual.mjs.map'),
    metadata({ id: JSON.stringify(`${expectedId}-map`) })
  );
  await assert.rejects(
    gatewayFunctionId(root),
    (error) => error.actual === 0 && error.expected === 1
  );
  await writeFile(join(root, 'actual.mjs'), emitted);
  assert.equal(await gatewayFunctionId(root), expectedId);
  await writeFile(
    join(root, 'ambiguous.js'),
    metadata({ id: JSON.stringify(`${expectedId}-other`) })
  );
  await assert.rejects(
    gatewayFunctionId(root),
    (error) => error.actual === 2 && error.expected === 1
  );
});

test('invalid JavaScript still rejects even beside valid emitted metadata', async (t) => {
  const root = await directory(t);
  await writeFile(join(root, 'actual.mjs'), emitted);
  await writeFile(join(root, 'invalid.mjs'), 'const = ;');
  await assert.rejects(gatewayFunctionId(root), SyntaxError);
});

for (const kind of ['file', 'directory']) {
  test(`${kind} symlinks still reject even beside valid emitted metadata`, async (t) => {
    const root = await directory(t);
    await writeFile(join(root, 'actual.mjs'), emitted);
    const target =
      kind === 'file' ? join(root, 'actual.mjs') : join(root, 'nested');
    if (kind === 'directory') await mkdir(target);
    await symlink(target, join(root, 'linked'));
    await assert.rejects(gatewayFunctionId(root), /cannot contain symlinks/);
  });
}
