import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ASSETS, BUNDLE, fixtureApp, SHA } from './web-vinext-seal.fixture.mjs';
import {
  buildEnvProblems,
  PUBLIC_BUILD_ENV,
  planFamilies,
  sealFamily,
  secretLookingEnv,
  writeReceipt,
} from './web-vinext-seal.mjs';
import {
  assertVinextModuleClosure,
  EXIT,
  familyDirsUnder,
  main as verifyMain,
  SealError,
  secretShapes,
  verifyReceipt,
  verifySealedFamily,
} from './web-vinext-sealed-artifact.mjs';

const OTHER_SHA = 'b'.repeat(40);
function sealed(t, options) {
  const fixture = fixtureApp(t, options);
  sealFamily({
    appDir: fixture.app,
    family: fixture.family,
    sha: options?.sha ?? SHA,
    outDir: fixture.out,
  });
  return fixture;
}

function assertCode(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof SealError, String(error));
    assert.equal(error.code, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('closure admits only declared WASM from the published bundle', (t) => {
  const { app } = fixtureApp(t, { chunk: 'import wasm from "./known.wasm";' });
  const bundle = join(app, BUNDLE);
  const path = 'ssr/known.wasm';
  const bytes = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  writeFileSync(join(bundle, path), bytes);
  const prior = { [path]: createHash('sha256').update(bytes).digest('hex') };
  const manifest = { modules: { [path]: { type: 'wasm' } } };
  assert.deepEqual(assertVinextModuleClosure(bundle, manifest, prior), {
    names: ['index.mjs', 'ssr/index.js', path],
    esm: ['index.mjs', 'ssr/index.js'],
  });
  assertCode(() => assertVinextModuleClosure(bundle, {}, prior), EXIT.closure);
  assertCode(
    () =>
      assertVinextModuleClosure(
        bundle,
        { modules: { [path]: { type: 'data' } } },
        prior
      ),
    EXIT.closure,
    /unsupported/u
  );
  assertCode(
    () => assertVinextModuleClosure(bundle, manifest, {}),
    EXIT.closure
  );
  writeFileSync(join(bundle, path), Buffer.concat([bytes, Buffer.from([1])]));
  assertCode(
    () => assertVinextModuleClosure(bundle, manifest, prior),
    EXIT.closure,
    /differs from the published closure/u
  );
});

test('a sealed family verifies with sorted per-file and per-module hashes', (t) => {
  const { out } = sealed(t);
  const { seal, sealSha256 } = verifySealedFamily(out, SHA, {
    expectedFamily: 'api-core',
  });
  assert.match(sealSha256, /^[0-9a-f]{64}$/u);
  assert.equal(seal.worker, 'tuturuuu-web-vinext-api-core');
  assert.equal(seal.deploymentStamp, SHA.slice(0, 12));
  assert.equal(seal.mainModule, 'index.mjs');
  assert.equal(seal.stampModule, 'index.mjs');
  assert.deepEqual(Object.keys(seal.modules), ['index.mjs', 'ssr/index.js']);
  assert.equal(seal.moduleCount, 2);
  const files = Object.keys(seal.files);
  assert.deepEqual(files, [...files].sort());
  for (const name of [
    'assets-manifest.json',
    'check.json',
    'dry-run.log',
    'imports-check.json',
    'output/v1/workers/default/assets/_headers',
  ]) {
    assert.ok(files.includes(name), name);
  }
  const manifest = JSON.parse(
    readFileSync(join(out, 'assets-manifest.json'), 'utf8')
  );
  assert.equal(manifest.assetsDir, 'output/v1/workers/default/assets');
  assert.ok(manifest.files._headers);
  assert.equal(verifyMain([out, SHA, '--family', 'api-core']), EXIT.ok);
});

test('a changed module byte is tamper', (t) => {
  const { out } = sealed(t);
  appendFileSync(
    join(out, 'output/v1/workers/default/bundle/ssr/index.js'),
    ' '
  );
  assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper, /hash mismatch/u);
});

test('an unsealed extra file is tamper', (t) => {
  const { out } = sealed(t);
  writeFileSync(join(out, 'output/v1/workers/default/bundle/extra.mjs'), '1');
  assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper, /unsealed/u);
});

test('an edited seal.json no longer matches the receipt', (t) => {
  const { root, out } = sealed(t);
  const receiptPath = join(root, 'receipt.json');
  writeReceipt({
    sha: SHA,
    familyDirs: { 'api-core': out },
    outPath: receiptPath,
  });
  assert.equal(
    verifyReceipt(receiptPath, familyDirsUnder(join(root, 'sealed')), SHA).sha,
    SHA
  );
  const sealPath = join(out, 'seal.json');
  const seal = JSON.parse(readFileSync(sealPath, 'utf8'));
  seal.build = { runId: 'forged' };
  writeFileSync(sealPath, JSON.stringify(seal, null, 2));
  assertCode(
    () => verifyReceipt(receiptPath, { 'api-core': out }, SHA),
    EXIT.tamper,
    /differs from the receipt/u
  );
});

test('a missing module is reported as missing', (t) => {
  const { out } = sealed(t);
  unlinkSync(join(out, 'output/v1/workers/default/bundle/ssr/index.js'));
  assertCode(() => verifySealedFamily(out, SHA), EXIT.missing, /missing/u);
});

test('a missing family in the receipt run is refused', (t) => {
  const { root, out } = sealed(t);
  assertCode(
    () =>
      writeReceipt({
        sha: SHA,
        familyDirs: { 'api-core': out },
        outPath: join(root, 'receipt.json'),
        expected: ['api-core', 'api-ops'],
      }),
    EXIT.missing
  );
});

test('a wrong or malformed sha is a pin mismatch', (t) => {
  const { out } = sealed(t);
  assertCode(() => verifySealedFamily(out, OTHER_SHA), EXIT.pin, /differs/u);
  assertCode(() => verifySealedFamily(out, 'abc'), EXIT.pin);
  assertCode(
    () => verifySealedFamily(out, SHA, { expectedFamily: 'dashboard' }),
    EXIT.pin
  );
});

test('a build stamped with another commit cannot be sealed for the pin', (t) => {
  const fixture = fixtureApp(t, { sha: OTHER_SHA });
  assertCode(
    () =>
      sealFamily({
        appDir: fixture.app,
        family: fixture.family,
        sha: SHA,
        outDir: fixture.out,
      }),
    EXIT.stamp
  );
});

test('a module without the quoted pin sha fails the stamp', (t) => {
  const fixture = fixtureApp(t);
  writeFileSync(join(fixture.app, BUNDLE, 'index.mjs'), 'export default {};\n');
  assertCode(
    () =>
      sealFamily({
        appDir: fixture.app,
        family: fixture.family,
        sha: SHA,
        outDir: fixture.out,
      }),
    EXIT.stamp
  );
});

test('a removed _headers stamp rule fails verification', (t) => {
  const { out } = sealed(t);
  const headers = join(out, 'output/v1/workers/default/assets/_headers');
  writeFileSync(headers, '/*\n  x-other: 1\n');
  assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper);
});

test('an import of an unsealed module fails the closure', (t) => {
  // A dot directory is never uploaded, so importing from it drops a module.
  const fixture = fixtureApp(t, {
    chunk: 'import "./.cache/late.mjs";\nexport const page = 1;\n',
  });
  mkdirSync(join(fixture.app, BUNDLE, 'ssr/.cache'));
  writeFileSync(
    join(fixture.app, BUNDLE, 'ssr/.cache/late.mjs'),
    'export {};\n'
  );
  assertCode(
    () =>
      sealFamily({
        appDir: fixture.app,
        family: fixture.family,
        sha: SHA,
        outDir: fixture.out,
      }),
    EXIT.closure,
    /drops imported modules/u
  );
});

test('a forbidden secret value in the output refuses the seal without printing it', (t) => {
  const secret = 'not-public-value-1234567890';
  const fixture = fixtureApp(t, { chunk: `export const k = "${secret}";\n` });
  assert.throws(
    () =>
      sealFamily({
        appDir: fixture.app,
        family: fixture.family,
        sha: SHA,
        outDir: fixture.out,
        forbidden: { SUPABASE_SECRET_KEY: secret },
      }),
    (error) => {
      assert.equal(error.code, EXIT.secret);
      assert.match(error.message, /value of SUPABASE_SECRET_KEY/u);
      assert.ok(!error.message.includes(secret), 'secret value printed');
      return true;
    }
  );
});

test('secret-shaped values and env files are refused', (t) => {
  const fixture = fixtureApp(t, {
    chunk: `export const k = "sb_secret_${'x'.repeat(32)}";\n`,
  });
  assertCode(
    () =>
      sealFamily({
        appDir: fixture.app,
        family: fixture.family,
        sha: SHA,
        outDir: fixture.out,
      }),
    EXIT.secret,
    /supabase-secret-key/u
  );
  const role = (value) =>
    Buffer.from(JSON.stringify({ role: value })).toString('base64url');
  const jwt = (value) => `eyJhbGciOiJIUzI1NiJ9.${role(value)}.signature123`;
  const anon = fixtureApp(t, { chunk: `export const k = "${jwt('anon')}";\n` });
  sealFamily({
    appDir: anon.app,
    family: anon.family,
    sha: SHA,
    outDir: anon.out,
  });
  const { out } = sealed(t);
  writeFileSync(
    join(out, 'output/v1/workers/default/bundle/ssr/index.js'),
    `export const k = "${jwt('service_role')}";\n`
  );
  // Hashes catch it first; the scan is a second line for re-sealed trees.
  assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper);
  const envFile = fixtureApp(t);
  writeFileSync(join(envFile.app, ASSETS, '.dev.vars'), 'X=1\n');
  assertCode(
    () =>
      sealFamily({
        appDir: envFile.app,
        family: envFile.family,
        sha: SHA,
        outDir: envFile.out,
      }),
    EXIT.secret,
    /forbidden file/u
  );
});

test('the build env guard allows only the public values', () => {
  const env = Object.fromEntries(
    PUBLIC_BUILD_ENV.map((name) => [name, `public-${name.toLowerCase()}`])
  );
  assert.deepEqual(
    buildEnvProblems({ ...env, GITHUB_SHA: SHA, PATH: '/usr/bin' }),
    []
  );
  const problems = buildEnvProblems({
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_EXTRA: 'x',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${'y'.repeat(30)}`,
    CLOUDFLARE_API_TOKEN: 'token-value-123',
    CF_API_TOKEN: 'token-value-456',
    SUPABASE_SECRET_KEY: 'secret-value-789',
  });
  assert.deepEqual(problems, [
    'NEXT_PUBLIC_SUPABASE_URL is empty or unset',
    'CF_API_TOKEN is a deploy credential name',
    'CLOUDFLARE_API_TOKEN is a deploy credential name',
    'NEXT_PUBLIC_EXTRA is not an allowed public build value',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret-shaped value',
    'SUPABASE_SECRET_KEY looks like a secret',
  ]);
  for (const problem of problems) {
    assert.ok(!/value-\d/u.test(problem), 'a value was printed');
  }
  assert.deepEqual(
    Object.keys(
      secretLookingEnv({ ...env, ACTIONS_RUNTIME_TOKEN: 'abcdefgh1' })
    ),
    ['ACTIONS_RUNTIME_TOKEN']
  );
});

test('the cf telemetry flag accepts only the literal false value', () => {
  const publicEnv = Object.fromEntries(
    PUBLIC_BUILD_ENV.map((name) => [name, 'public'])
  );
  assert.deepEqual(
    buildEnvProblems({ ...publicEnv, CF_SEND_TELEMETRY: 'false' }),
    []
  );
  assert.deepEqual(
    buildEnvProblems({ ...publicEnv, CF_SEND_TELEMETRY: 'true' }),
    ['CF_SEND_TELEMETRY must be false']
  );
  assert.deepEqual(
    buildEnvProblems({ ...publicEnv, OLDCLI_API_TOKEN: 'short' }),
    ['OLDCLI_API_TOKEN is a deploy credential name']
  );
});

test('the families input must name enabled families once', () => {
  const enabled = ['api-core', 'api-ops', 'public-auth'];
  assert.deepEqual(planFamilies('', enabled), enabled);
  assert.deepEqual(planFamilies(' public-auth,api-core ', enabled), [
    'api-core',
    'public-auth',
  ]);
  assert.throws(() => planFamilies('api-core,bogus', enabled), /bogus/u);
  assert.throws(() => planFamilies('api-core,api-core', enabled), /repeats/u);
});

test('the committed families are exactly the six Web Workers', () => {
  const { families } = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/web/cloudflare/vinext/families.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  assert.deepEqual(
    families
      .filter((family) => family.enabled)
      .map((family) => family.id)
      .sort(),
    [
      'api-core',
      'api-ops',
      'dashboard',
      'dashboard-apps',
      'public-auth',
      'web-rest',
    ]
  );
});

function editJson(path, edit) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  edit(value);
  writeFileSync(path, JSON.stringify(value, null, 2));
}

test('seal layout fields are pinned to the vinext layout', (t) => {
  const { out } = sealed(t);
  const sealPath = join(out, 'seal.json');
  const original = readFileSync(sealPath, 'utf8');
  // A decoy bundle elsewhere in the sealed tree cannot be selected.
  for (const [field, value] of [
    ['bundleDir', 'output/v1/workers/default/assets'],
    ['bundleDir', 'output/v1/workers/default/bundle/ssr'],
    ['mainModule', 'ssr/index.js'],
    ['assetsDir', 'output/v1/workers/default/bundle'],
  ]) {
    writeFileSync(sealPath, original);
    editJson(sealPath, (seal) => {
      seal[field] = value;
    });
    assertCode(() => verifySealedFamily(out, SHA), EXIT.pin, /unexpected/u);
  }
});

test('assets manifest entries need a sha256, a size and a clean path', (t) => {
  const { out } = sealed(t);
  const manifestPath = join(out, 'assets-manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const cases = [
    (files) => {
      files._headers = {};
    },
    (files) => {
      files._headers = { ...files._headers, sha256: 'A'.repeat(64) };
    },
    (files) => {
      files['../seal.json'] = files._headers;
    },
    (files) => {
      files['./_headers'] = files._headers;
    },
  ];
  for (const edit of cases) {
    writeFileSync(manifestPath, original);
    editJson(manifestPath, (manifest) => edit(manifest.files));
    // The manifest is itself sealed: restore its hash so only the entry
    // check can refuse it.
    const bytes = readFileSync(manifestPath);
    editJson(join(out, 'seal.json'), (seal) => {
      seal.files['assets-manifest.json'] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    });
    assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper);
  }
});

test('a symlink in the sealed tree is tamper', (t) => {
  const { out } = sealed(t);
  symlinkSync(
    '/etc/hosts',
    join(out, 'output/v1/workers/default/bundle/linked.mjs')
  );
  assertCode(() => verifySealedFamily(out, SHA), EXIT.tamper, /symlink/u);
});

test('provider key shapes are recognised and public look-alikes pass', () => {
  const cases = {
    'stripe-live-key': `sk_live_${'a1'.repeat(14)}`,
    'aws-access-key-id': 'AKIAIOSFODNN7EXAMPLE',
    'openai-api-key': `sk-proj-${'x'.repeat(48)}`,
    'anthropic-api-key': `sk-ant-api03-${'y'.repeat(90)}`,
    'github-token': `ghp_${'z'.repeat(36)}`,
  };
  for (const [rule, value] of Object.entries(cases)) {
    assert.deepEqual(secretShapes(`const k = "${value}";`), [rule], rule);
  }
  for (const text of [
    'key.startsWith("sb_secret_")',
    'const p = "sk_live_";',
    'const tag = "AKIA";',
    'sk-ant-',
    'pk_live_51ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ]) {
    assert.deepEqual(secretShapes(text), [], text);
  }
});
