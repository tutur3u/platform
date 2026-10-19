import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  manifest,
  PRIVATE_CANARY,
  validateOutput,
  verify,
} from './calendar-native-artifact.mjs';

const sha = 'a'.repeat(40);
function fixture(run) {
  const app = mkdtempSync(resolve(tmpdir(), 'calendar-artifact-'));
  const put = (name, data) => {
    const path = resolve(app, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
  };
  const pointer = {
    configPath: '../../dist/server/wrangler.json',
    auxiliaryWorkers: [],
  };
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    d1_databases: [],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  put('.wrangler/deploy/config.json', pointer);
  put('dist/server/wrangler.json', config);
  put(
    'dist/server/worker.js',
    'export default { fetch() { return new Response("fixture"); } };'
  );
  put('dist/client/serwist/sw.js', 'self.addEventListener("fetch", () => {});');
  put('cloudflare-env.d.ts', 'interface CloudflareEnv { ASSETS: Fetcher }');
  try {
    run({ app, put, pointer, config });
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}
test('seal survives relocation and binds exact SHA, Worker, pointer and client bytes', () =>
  fixture(({ app, put }) => {
    const receipt = manifest(app, sha);
    verify(app, receipt, sha);
    const relocated = mkdtempSync(resolve(tmpdir(), 'calendar-restored-'));
    try {
      cpSync(app, relocated, { recursive: true });
      verify(relocated, receipt, sha);
    } finally {
      rmSync(relocated, { recursive: true, force: true });
    }
    assert.equal(receipt.main, 'dist/server/worker.js');
    assert.throws(() => verify(app, receipt, 'b'.repeat(40)));
    put('dist/server/worker.js', 'changed');
    assert.throws(() => verify(app, receipt, sha));
  }));
for (const change of [
  (p) => {
    delete p.auxiliaryWorkers;
  },
  (p) => {
    p.auxiliaryWorkers = ['extra'];
  },
  (p) => {
    p.prerender = true;
  },
  (p) => {
    p.configPath = '/tmp/escape';
  },
  (p) => {
    p.configPath = '../../../package.json';
  },
  (p) => {
    p.configPath += '\nconfig=escape';
  },
])
  test(`reject malformed deploy pointer ${change.toString()}`, () =>
    fixture(({ app, put, pointer }) => {
      change(pointer);
      put('.wrangler/deploy/config.json', pointer);
      assert.throws(() => validateOutput(app));
    }));
for (const change of [
  (c) => {
    c.name = 'other';
  },
  (c) => {
    c.account_id = 'invented';
  },
  (c) => {
    c.routes = [{ pattern: 'calendar.invalid' }];
  },
  (c) => {
    c.workers_dev = true;
  },
  (c) => {
    c.assets.run_worker_first = false;
  },
  (c) => {
    c.assets.not_found_handling = 'single-page-application';
  },
  (c) => {
    c.triggers = { crons: ['* * * * *'] };
  },
  (c) => {
    c.services = [{ binding: 'NEW_SERVICE', service: 'new' }];
  },
  (c) => {
    c.build = { command: 'void deploy' };
  },
  (c) => {
    c.secrets = { required: ['UNREVIEWED_SECRET'] };
  },
])
  test(`reject unqualified config ${change.toString()}`, () =>
    fixture(({ app, put, config }) => {
      change(config);
      put('dist/server/wrangler.json', config);
      assert.throws(() => manifest(app, sha));
    }));
test('reject private client literals, hidden env and symlink additions', () =>
  fixture(({ app, put }) => {
    put('dist/client/leak.js', PRIVATE_CANARY);
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/leak.js'));
    put('dist/client/.dev.vars', 'PRIVATE=value');
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/.dev.vars'));
    symlinkSync(
      resolve(app, 'dist/server/worker.js'),
      resolve(app, 'dist/client/link.js')
    );
    assert.throws(() => manifest(app, sha));
  }));
for (const path of [
  'cloudflare-env.d.ts',
  'dist/client/extra.js',
  '.wrangler/deploy/config.json',
]) {
  test(`seal detects mutation or addition at ${path}`, () =>
    fixture(({ app, put }) => {
      const receipt = manifest(app, sha);
      put(path, 'changed');
      assert.throws(() => verify(app, receipt, sha));
    }));
}
test('legacy Worker entry cannot qualify even if its bundle exists', () =>
  fixture(({ app, put, config }) => {
    put('dist/server/.open-next/worker.js', 'export default {};');
    config.main = '.open-next/worker.js';
    put('dist/server/wrangler.json', config);
    assert.throws(() => validateOutput(app));
  }));
test('source-only discovery excludes mandatory artifact runtime suites', async () => {
  const { createRequire } = await import('node:module');
  const { discoverScriptTests } = createRequire(import.meta.url)(
    '../run-script-tests.js'
  );
  const tests = discoverScriptTests();
  assert.ok(tests.includes('scripts/ci/calendar-native-artifact.test.mjs'));
  assert.ok(!tests.includes('scripts/ci/calendar-native-worker.runtime.mjs'));
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/mail-calendar-tasks-builds.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.equal(
    (
      workflow.match(
        /node --test scripts\/ci\/calendar-native-worker\.runtime\.mjs/g
      ) ?? []
    ).length,
    2
  );
  assert.equal(
    (
      workflow.match(
        /node --test src\/runtime\/offline-artifact\.runtime\.mjs/g
      ) ?? []
    ).length,
    2
  );
  assert.doesNotMatch(
    workflow,
    /continue-on-error|wrangler deploy(?! --dry-run)/
  );
  assert.match(
    workflow,
    /SOURCE_SHA: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/
  );
});

test('accept the owning Cloudflare Vite 1.64 prebundled ESModule output shape', () =>
  fixture(({ app }) => {
    const { config } = validateOutput(app);
    assert.equal(config.no_bundle, true);
    assert.deepEqual(config.rules, [
      { type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] },
    ]);
    assert.equal(manifest(app, sha).main, 'dist/server/worker.js');
  }));
for (const [label, change] of [
  [
    'missing no_bundle',
    (c) => {
      delete c.no_bundle;
    },
  ],
  [
    'bundle enabled',
    (c) => {
      c.no_bundle = false;
    },
  ],
  [
    'string no_bundle',
    (c) => {
      c.no_bundle = 'true';
    },
  ],
  [
    'missing rules',
    (c) => {
      delete c.rules;
    },
  ],
  [
    'empty rules',
    (c) => {
      c.rules = [];
    },
  ],
  [
    'CommonJS rule',
    (c) => {
      c.rules[0].type = 'CommonJS';
    },
  ],
  [
    'missing mjs glob',
    (c) => {
      c.rules[0].globs = ['**/*.js'];
    },
  ],
  [
    'extra wildcard glob',
    (c) => {
      c.rules[0].globs.push('**/*');
    },
  ],
  [
    'extra module rule',
    (c) => {
      c.rules.push({ type: 'Text', globs: ['**/*.txt'] });
    },
  ],
  [
    'extra fallthrough property',
    (c) => {
      c.rules[0].fallthrough = true;
    },
  ],
  [
    'extra rule property',
    (c) => {
      c.rules[0].unexpected = true;
    },
  ],
])
  test(`reject unsafe or noncanonical emitter shape: ${label}`, () =>
    fixture(({ app, put, config }) => {
      change(config);
      put('dist/server/wrangler.json', config);
      assert.throws(() => validateOutput(app));
    }));
test('both native workflow triggers select Web-only changes and keep Web consumers required', async () => {
  const { createRequire } = await import('node:module');
  const { readWorkflow } = createRequire(import.meta.url)(
    './workflow-yaml-test-helper.js'
  );
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  for (const event of ['pull_request', 'push']) {
    assert.ok(
      workflow.on[event].paths.includes('apps/web/**'),
      `${event} must select Web-only changes`
    );
  }
  assert.ok(workflow.jobs.build.strategy.matrix.app.includes('web'));
  const steps = workflow.jobs['calendar-native'].steps;
  const webTests = steps.find((step) =>
    step.run?.includes('bun run --cwd apps/web test')
  );
  const webTypes = steps.find((step) =>
    step.run?.includes(
      'type-check --filter=@tuturuuu/calendar --filter=@tuturuuu/web'
    )
  );
  assert.ok(webTests, 'owning Web tests must remain required');
  assert.ok(webTypes, 'affected Web consumer types must remain required');
  for (const step of [webTests, webTypes]) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
});
