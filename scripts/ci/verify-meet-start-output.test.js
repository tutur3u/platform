const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const {
  artifactManifest,
  identity,
  secretNames,
  validateOutput,
  verifyManifest,
} = require('./verify-meet-start-output');

const sha = 'a'.repeat(40);
function fixture(t) {
  const app = mkdtempSync(join(tmpdir(), 'meet-start-output-'));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  mkdirSync(join(app, '.wrangler/deploy'), { recursive: true });
  mkdirSync(join(app, 'dist/ssr'), { recursive: true });
  mkdirSync(join(app, 'dist/client'), { recursive: true });
  writeFileSync(
    join(app, '.wrangler/deploy/config.json'),
    JSON.stringify({
      configPath: '../../dist/ssr/wrangler.json',
      auxiliaryWorkers: [],
    })
  );
  writeFileSync(
    join(app, 'dist/ssr/index.js'),
    'export default {fetch(){return new Response("fixture")}}'
  );
  writeFileSync(
    join(app, 'dist/client/asset.js'),
    'export const ready = true;'
  );
  const config = structuredClone(identity);
  Object.assign(config, {
    main: 'index.js',
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    secrets: { required: secretNames },
  });
  function save() {
    writeFileSync(join(app, 'dist/ssr/wrangler.json'), JSON.stringify(config));
  }
  save();
  return { app, config, save };
}

test('discovers the emitted config from deploy metadata and verifies a relocated artifact', (t) => {
  const original = fixture(t);
  const restored = fixture(t);
  assert.equal(validateOutput(original.app).config.name, 'tuturuuu-meet');
  const manifest = artifactManifest(original.app, sha);
  verifyManifest(restored.app, manifest, sha);
  assert.ok(manifest.files['dist/client/asset.js']);
  assert.ok(manifest.files['.wrangler/deploy/config.json']);
});

for (const [name, mutate] of [
  ['missing auxiliary workers', (r) => delete r.auxiliaryWorkers],
  [
    'null auxiliary workers',
    (r) => {
      r.auxiliaryWorkers = null;
    },
  ],
  [
    'object auxiliary workers',
    (r) => {
      r.auxiliaryWorkers = {};
    },
  ],
  [
    'string auxiliary workers',
    (r) => {
      r.auxiliaryWorkers = '';
    },
  ],
  [
    'additional Worker',
    (r) => {
      r.auxiliaryWorkers = [{ configPath: '../../dist/ssr/other.json' }];
    },
  ],
  [
    'escaping auxiliary Worker',
    (r) => {
      r.auxiliaryWorkers = [{ configPath: '../../../../outside.json' }];
    },
  ],
  [
    'absolute auxiliary Worker',
    (r) => {
      r.auxiliaryWorkers = [{ configPath: '/tmp/worker.json' }];
    },
  ],
  [
    'external auxiliary Worker',
    (r) => {
      r.auxiliaryWorkers = [
        { configPath: 'https://example.invalid/worker.json' },
      ];
    },
  ],
  [
    'prerender Worker',
    (r) => {
      r.prerenderWorkerConfigPath = '../../dist/ssr/prerender.json';
    },
  ],
  [
    'unknown redirect field',
    (r) => {
      r.worker = '../../dist/ssr/other.json';
    },
  ],
  [
    'escaping config path',
    (r) => {
      r.configPath = '../../../../outside.json';
    },
  ],
  [
    'absolute config path',
    (r) => {
      r.configPath = '/tmp/worker.json';
    },
  ],
]) {
  test(`rejects deploy metadata with ${name}`, (t) => {
    const f = fixture(t);
    const redirect = {
      configPath: '../../dist/ssr/wrangler.json',
      auxiliaryWorkers: [],
    };
    mutate(redirect);
    writeFileSync(
      join(f.app, '.wrangler/deploy/config.json'),
      JSON.stringify(redirect)
    );
    assert.throws(() => validateOutput(f.app));
  });
}

for (const field of Object.keys(identity)) {
  test(`rejects changed existing ${field} before publication`, (t) => {
    const f = fixture(t);
    f.config[field] = null;
    f.save();
    assert.throws(() => validateOutput(f.app), /drift/);
  });
}

for (const [name, mutate] of [
  [
    'new D1 database',
    (c) => {
      c.d1_databases = [{ binding: 'DB', database_id: 'new' }];
    },
  ],
  [
    'new R2 bucket',
    (c) => {
      c.r2_buckets.push({ binding: 'NEW', bucket_name: 'new' });
    },
  ],
  [
    'new DO class',
    (c) => {
      c.durable_objects.bindings.push({ name: 'NEW', class_name: 'New' });
    },
  ],
  [
    'migration',
    (c) => {
      c.migrations.push({ tag: 'new', new_classes: ['New'] });
    },
  ],
  [
    'secret value in vars',
    (c) => {
      c.vars.SUPABASE_SECRET_KEY = 'fixture-only';
    },
  ],
  [
    'SPA fallback',
    (c) => {
      c.assets.not_found_handling = 'single-page-application';
    },
  ],
  [
    'asset auth bypass',
    (c) => {
      c.assets.run_worker_first = false;
    },
  ],
  [
    'missing required secret name',
    (c) => {
      c.secrets.required = [];
    },
  ],
  [
    'build command',
    (c) => {
      c.build = { command: 'unexpected-build' };
    },
  ],
  [
    'named environment',
    (c) => {
      c.env = { staging: {} };
    },
  ],
  [
    'escaping entrypoint',
    (c) => {
      c.main = '../../../package.json';
    },
  ],
  [
    'absolute assets',
    (c) => {
      c.assets.directory = '/tmp';
    },
  ],
]) {
  test(`rejects ${name}`, (t) => {
    const f = fixture(t);
    mutate(f.config);
    f.save();
    assert.throws(() => validateOutput(f.app));
  });
}

test('rejects wrong SHA, omitted assets, changed modules, redirect drift and added files', (t) => {
  for (const change of ['sha', 'asset', 'module', 'redirect', 'extra']) {
    const f = fixture(t);
    const manifest = artifactManifest(f.app, sha);
    if (change === 'asset') rmSync(join(f.app, 'dist/client/asset.js'));
    if (change === 'module')
      writeFileSync(join(f.app, 'dist/ssr/index.js'), 'changed');
    if (change === 'extra')
      writeFileSync(join(f.app, 'dist/client/extra.js'), 'new');
    if (change === 'redirect')
      writeFileSync(join(f.app, '.wrangler/deploy/config.json'), '{}');
    assert.throws(() =>
      verifyManifest(f.app, manifest, change === 'sha' ? 'b'.repeat(40) : sha)
    );
  }
});

test('rejects symlinked assets and packaged environment files', (t) => {
  const f = fixture(t);
  symlinkSync(
    join(f.app, 'dist/ssr/index.js'),
    join(f.app, 'dist/client/link')
  );
  assert.throws(() => artifactManifest(f.app, sha), /symlink/);
  rmSync(join(f.app, 'dist/client/link'));
  writeFileSync(join(f.app, 'dist/client/.env.production'), 'fixture-only');
  assert.throws(() => artifactManifest(f.app, sha), /environment files/);
  assert.ok(readFileSync(join(f.app, 'dist/ssr/wrangler.json')).length);
});

test('configuration and manifest errors never dump raw values or nested path maps', (t) => {
  const f = fixture(t);
  f.config.vars.SUPABASE_SECRET_KEY = 'fixture-must-not-appear-in-diagnostics';
  f.save();
  assert.throws(
    () => validateOutput(f.app),
    (error) => {
      assert.doesNotMatch(
        String(error),
        /fixture-must-not-appear|SUPABASE_SECRET_KEY/
      );
      assert.equal(error.actual, false);
      return true;
    }
  );
  delete f.config.vars.SUPABASE_SECRET_KEY;
  f.save();
  const manifest = artifactManifest(f.app, sha);
  writeFileSync(join(f.app, 'dist/client/asset.js'), 'changed');
  assert.throws(
    () => verifyManifest(f.app, manifest, sha),
    (error) => {
      assert.doesNotMatch(String(error), /dist\/client\/asset\.js/);
      assert.equal(error.actual, false);
      return true;
    }
  );
});
