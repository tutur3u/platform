const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const control = require('./types-emission-artifact');
const h = (s) => createHash('sha256').update(s).digest('hex');
const sorted = (x) =>
  Array.isArray(x)
    ? x.map(sorted)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sorted(x[k])])
        )
      : x;
const seal = (x) => ({ ...x, manifestSha256: h(JSON.stringify(sorted(x))) });
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixtures() {
  const paths = [
    'packages/types/dist/index.d.ts',
    'packages/types/dist/index.js',
    'packages/types/dist/primitives/playgrounds.d.ts',
    'packages/types/dist/primitives/playgrounds.js',
    'packages/types/tsconfig.build.tsbuildinfo',
  ];
  const facts = {
    sourceSha: '7518b8a026304a5721aa2db3572fbe6e36e11dae',
    controlSha: 'a'.repeat(40),
    lockSha256: h('lock'),
    configSha256: h('config'),
    sourceTreeSha256: h('source'),
    nodeSha256: h('node'),
    bunSha256: h('bun'),
    compilerSha256: h('compiler'),
    nodeVersion: 'v24.21.0',
    bunVersion: '1.4.1',
    compilerVersion: '7.0.2',
    expectedPaths: paths,
    exportTargets: [
      './dist/index.d.ts',
      './dist/index.js',
      './dist/primitives/*.d.ts',
      './dist/primitives/*.js',
    ],
    configuredBuildInfo: 'packages/types/tsconfig.build.tsbuildinfo',
    files: paths.map((p) => ({
      path: p,
      sha256: h(p),
      bytes: 10,
      type: 'file',
    })),
    buildExit: 0,
    membershipKnown: true,
    runId: '123',
    job: 'types-emission',
    attempt: 1,
  };
  const manifest = seal({ version: 1, ...facts });
  const contract = Object.fromEntries(
    Object.entries(facts).filter(
      ([k]) => !['files', 'buildExit', 'membershipKnown'].includes(k)
    )
  );
  contract.reservationReady = true;
  const vs = [
    { entry: 'createManifest', args: [facts], expected: manifest },
    { entry: 'validateManifest', args: [manifest, contract], expected: true },
  ];
  for (const [key, value] of [
    ['sourceSha', 'b'.repeat(40)],
    ['controlSha', 'b'.repeat(40)],
    ['lockSha256', h('otherlock')],
    ['configSha256', h('otherconfig')],
    ['nodeSha256', h('othernode')],
  ]) {
    const c = clone(contract);
    c[key] = value;
    vs.push({ entry: 'validateManifest', args: [manifest, c], throws: true });
  }
  const mods = [
    (m) => m.files.pop(),
    (m) =>
      m.files.push({
        path: 'packages/types/dist/extra.js',
        sha256: h('extra'),
        bytes: 1,
        type: 'file',
      }),
    (m) => {
      m.files[0].sha256 = h('tamper');
    },
    (m) => {
      m.files[0].path = '../escape';
    },
    (m) => {
      m.files[0].type = 'symlink';
    },
    (m) => m.files.push(clone(m.files[0])),
  ];
  mods.forEach((change, i) => {
    let m = clone(manifest);
    change(m);
    if (i !== 2) {
      const { manifestSha256: _hash, ...data } = m;
      m = seal(data);
    }
    vs.push({ entry: 'validateManifest', args: [m, contract], throws: true });
  });
  const c = clone(contract);
  c.reservationReady = false;
  vs.push({ entry: 'validateManifest', args: [manifest, c], throws: true });
  for (const [key, value] of [
    ['membershipKnown', false],
    ['buildExit', 1],
  ]) {
    const f = clone(facts);
    f[key] = value;
    vs.push({ entry: 'createManifest', args: [f], throws: true });
  }
  const m = clone(manifest);
  m.secret = 'NEVER_EXPORT';
  vs.push({ entry: 'validateManifest', args: [m, contract], throws: true });
  return vs;
}
const vectors = fixtures();
if (process.env.TYPES_PROVENANCE_VECTORS) {
  const bound = JSON.parse(
    fs.readFileSync(process.env.TYPES_PROVENANCE_VECTORS)
  ).vectors.slice(0, 17);
  assert.deepEqual(
    vectors,
    bound,
    'Actual public-entry arguments must match complete prebound vectors'
  );
}
function check(indices) {
  for (const i of indices) {
    const v = vectors[i];
    if (v.throws)
      assert.throws(
        () => control[v.entry](...v.args),
        /Types emission artifact HOLD/
      );
    else assert.deepEqual(control[v.entry](...v.args), v.expected);
  }
}
test('creates a complete sealed export manifest', () => check([0]));
test('validates against independently owned receiver contract', () =>
  check([1]));
test('rejects different source and control identities', () => check([2, 3]));
test('rejects stale lock config and runtime provenance', () =>
  check([4, 5, 6]));
test('requires whole configured output closure', () => check([7, 8]));
test('rejects tampered bytes without hash repair', () => check([9]));
test('rejects traversal and symlink output', () => check([10, 11]));
test('rejects duplicate output records', () => check([12]));
test('requires separately admitted receiver reservation', () => check([13]));
test('unknown membership and failed build cannot become ready', () =>
  check([14, 15]));
test('rejects secret and unknown payload fields', () => check([16]));
test('workflow keeps nonpublishing opt-in source and control boundaries', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/type-check.yaml'),
    'utf8'
  );
  assert.match(text, /types_emission_only:/);
  assert.match(text, /inputs.types_emission_only != true/);
  assert.match(
    text,
    /needs.types-emission-check-ci.outputs.should_run == 'true'/
  );
  assert.match(text, /ref: \$\{\{ inputs.source_sha \}\}/);
  assert.match(text, /ref: \$\{\{ github.sha \}\}/);
  assert.match(text, /path: types-source/);
  assert.match(text, /bun install --frozen-lockfile/);
  assert.match(
    text,
    /working-directory: types-source\/packages\/types\n {8}run: bun run build/
  );
  assert.match(text, /types-emission-artifact.js create/);
  assert.match(text, /actions\/upload-artifact@v7/);
  assert.ok(!text.includes('npm publish'));
});
