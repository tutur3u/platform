import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
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
        /node scripts\/ci\/calendar-native-worker\.runtime\.mjs "\$SOURCE_SHA"/g
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
    step.with?.command?.includes(
      'type-check --filter=@tuturuuu/calendar --filter=@tuturuuu/web'
    )
  );
  assert.ok(webTests, 'owning Web tests must remain required');
  assert.ok(webTypes, 'affected Web consumer types must remain required');
  assert.equal(webTypes.uses, './.github/actions/run-with-turbo-remote-cache');
  for (const step of [webTests, webTypes]) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
});

function artifactCli(args) {
  return spawnSync(
    process.execPath,
    [
      new URL('./calendar-native-artifact.mjs', import.meta.url).pathname,
      ...args,
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
}
test('actual CLI seals and verifies only the explicitly supplied exact source SHA', () =>
  fixture(({ app }) => {
    const receipt = resolve(app, 'receipt.json');
    const sealed = artifactCli(['seal', app, sha, receipt]);
    assert.equal(sealed.status, 0, sealed.stderr);
    assert.equal(JSON.parse(readFileSync(receipt, 'utf8')).sha, sha);
    const verified = artifactCli(['verify', app, sha, receipt]);
    assert.equal(verified.status, 0, verified.stderr);
    const mismatch = artifactCli(['verify', app, 'b'.repeat(40), receipt]);
    assert.equal(mismatch.signal, null);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /artifact identity or bytes changed/);
  }));
for (const supplied of [undefined, 'short', 'A'.repeat(40), 'g'.repeat(40)]) {
  test(`actual CLI rejects missing or invalid exact SHA: ${supplied}`, () =>
    fixture(({ app }) => {
      for (const mode of ['seal', 'verify', 'config']) {
        const args =
          supplied === undefined ? [mode, app] : [mode, app, supplied];
        const result = artifactCli(args);
        assert.equal(result.signal, null);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /exact source SHA required/);
      }
    }));
}
test('actual Worker-suite CLI rejects a missing SHA before artifact or runtime setup', () => {
  const result = spawnSync(
    process.execPath,
    [new URL('./calendar-native-worker.runtime.mjs', import.meta.url).pathname],
    { encoding: 'utf8', timeout: 10000 }
  );
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact source SHA required/);
});
test('all actual artifact and Worker workflow calls carry the selected SHA argument', async () => {
  const { createRequire } = await import('node:module');
  const { readWorkflow } = createRequire(import.meta.url)(
    './workflow-yaml-test-helper.js'
  );
  const { jobs } = readWorkflow('mail-calendar-tasks-builds.yaml');
  for (const name of ['calendar-native', 'calendar-artifact-restore']) {
    const job = jobs[name];
    assert.match(
      job.env.SOURCE_SHA,
      /^\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}$/
    );
    const commands = job.steps.flatMap((step) => (step.run ?? '').split('\n'));
    const calls = commands.filter((line) =>
      /node scripts\/ci\/calendar-native-(artifact|worker)/.test(line)
    );
    assert.equal(calls.length, 4);
    for (const command of calls) assert.match(command, /"\$SOURCE_SHA"/);
    assert.ok(
      commands.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"')
    );
  }
});
function savePointer(app) {
  mkdirSync(resolve(app, '.void'));
  renameSync(
    resolve(app, '.wrangler/deploy/config.json'),
    resolve(app, '.void/preview-deploy-config.json')
  );
}
test('saved Void bytes use the native base and survive selected-file relocation', () =>
  fixture(({ app, put }) => {
    const bytes = readFileSync(resolve(app, '.wrangler/deploy/config.json'));
    savePointer(app);
    assert.deepEqual(
      readFileSync(resolve(app, '.void/preview-deploy-config.json')),
      bytes
    );
    assert.equal(
      validateOutput(app).configPath,
      resolve(app, 'dist/server/wrangler.json')
    );
    const receipt = manifest(app, sha);
    assert.ok(receipt.files['.void/preview-deploy-config.json']);
    assert.equal(receipt.files['.wrangler/deploy/config.json'], undefined);
    const restored = mkdtempSync(resolve(tmpdir(), 'calendar-saved-restored-'));
    try {
      for (const path of [
        'dist',
        '.void/preview-deploy-config.json',
        'cloudflare-env.d.ts',
      ]) {
        const target = resolve(restored, path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(resolve(app, path), target, { recursive: true });
      }
      verify(restored, receipt, sha);
      assert.throws(() => verify(restored, receipt, 'b'.repeat(40)));
      writeFileSync(resolve(restored, 'dist/server/worker.js'), 'changed');
      assert.throws(() => verify(restored, receipt, sha));
    } finally {
      rmSync(restored, { recursive: true, force: true });
    }
    put('.void/preview-deploy-config.json', `${bytes.toString()}\n`);
    assert.throws(() => verify(app, receipt, sha));
  }));
test('a seal binds pointer location even when bytes stay identical', () =>
  fixture(({ app }) => {
    const receipt = manifest(app, sha);
    savePointer(app);
    validateOutput(app);
    assert.throws(() => verify(app, receipt, sha));
  }));
for (const kind of [
  'absent',
  'dual',
  'dangling dual',
  'saved symlink',
  'dangling saved',
  'ancestor symlink',
  'directory',
]) {
  test(`saved pointer rejects ${kind}`, () =>
    fixture(({ app, put }) => {
      savePointer(app);
      const saved = resolve(app, '.void/preview-deploy-config.json');
      const native = resolve(app, '.wrangler/deploy/config.json');
      if (kind === 'dual')
        put('.wrangler/deploy/config.json', readFileSync(saved).toString());
      else if (kind === 'dangling dual')
        symlinkSync(resolve(app, 'missing'), native);
      else if (kind === 'ancestor symlink') {
        renameSync(resolve(app, '.void'), resolve(app, 'saved-pointer'));
        symlinkSync(resolve(app, 'saved-pointer'), resolve(app, '.void'));
      } else {
        renameSync(saved, resolve(app, 'pointer-copy.json'));
        if (kind === 'saved symlink')
          symlinkSync(resolve(app, 'pointer-copy.json'), saved);
        if (kind === 'dangling saved')
          symlinkSync(resolve(app, 'missing'), saved);
        if (kind === 'directory') mkdirSync(saved);
      }
      assert.throws(() => validateOutput(app));
    }));
}
for (const [label, change] of [
  [
    'absolute',
    (p) => {
      p.configPath = '/tmp/wrangler.json';
    },
  ],
  [
    'escape',
    (p) => {
      p.configPath = '../../../wrangler.json';
    },
  ],
  [
    'saved-directory base',
    (p) => {
      p.configPath = '../dist/server/wrangler.json';
    },
  ],
  [
    'multiline',
    (p) => {
      p.configPath += '\nconfig=escape';
    },
  ],
  [
    'auxiliary Worker',
    (p) => {
      p.auxiliaryWorkers = ['extra'];
    },
  ],
  [
    'extra field',
    (p) => {
      p.extra = true;
    },
  ],
]) {
  test(`saved pointer rejects ${label}`, () =>
    fixture(({ app, put, pointer }) => {
      savePointer(app);
      change(pointer);
      put('.void/preview-deploy-config.json', pointer);
      assert.throws(() => validateOutput(app));
    }));
}
for (const [label, change] of [
  [
    'identity',
    (c) => {
      c.name = 'other';
    },
  ],
  [
    'compatibility date',
    (c) => {
      c.compatibility_date = '2026-10-18';
    },
  ],
  [
    'compatibility flags',
    (c) => {
      c.compatibility_flags = [];
    },
  ],
  [
    'worker publication',
    (c) => {
      c.workers_dev = true;
    },
  ],
  [
    'placement',
    (c) => {
      c.placement = { mode: 'smart' };
    },
  ],
  [
    'Durable Objects',
    (c) => {
      c.durable_objects = { bindings: [{ name: 'DO', class_name: 'Room' }] };
    },
  ],
  [
    'storage',
    (c) => {
      c.r2_buckets = [{ binding: 'BUCKET', bucket_name: 'other' }];
    },
  ],
  [
    'secrets',
    (c) => {
      c.secrets = { required: ['UNREVIEWED_SECRET'] };
    },
  ],
  [
    'environment',
    (c) => {
      c.env = { production: {} };
    },
  ],
  [
    'assets binding',
    (c) => {
      c.assets.binding = 'OTHER';
    },
  ],
  [
    'assets routing',
    (c) => {
      c.assets.run_worker_first = false;
    },
  ],
  [
    'SPA fallback',
    (c) => {
      c.assets.not_found_handling = 'single-page-application';
    },
  ],
  [
    'Worker escape',
    (c) => {
      c.main = '../../outside.js';
    },
  ],
]) {
  test(`saved pointer retains qualification: ${label}`, () =>
    fixture(({ app, put, config }) => {
      savePointer(app);
      change(config);
      put('dist/server/wrangler.json', config);
      assert.throws(() => manifest(app, sha));
    }));
}
test('saved pointer retains complete artifact and private-client fences', () =>
  fixture(({ app, put }) => {
    savePointer(app);
    put('dist/server/module.wasm', 'wasm-fixture');
    put('dist/client/font.woff2', 'font-fixture');
    const receipt = manifest(app, sha);
    put('dist/client/font.woff2', 'changed-font');
    assert.throws(() => verify(app, receipt, sha));
    put('dist/client/font.woff2', 'font-fixture');
    put('dist/server/module.wasm', 'changed-wasm');
    assert.throws(() => verify(app, receipt, sha));
    put('dist/server/module.wasm', 'wasm-fixture');
    put('dist/client/leak.js', PRIVATE_CANARY);
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/leak.js'));
    symlinkSync(
      resolve(app, 'dist/server/worker.js'),
      resolve(app, 'dist/client/link.js')
    );
    assert.throws(() => manifest(app, sha));
  }));

for (const saved of [false, true]) {
  test(`workflow archive restores the selected ${saved ? 'saved' : 'native'} pointer`, async () => {
    const { createRequire } = await import('node:module');
    const { readWorkflow } = createRequire(import.meta.url)(
      './workflow-yaml-test-helper.js'
    );
    const { jobs } = readWorkflow('mail-calendar-tasks-builds.yaml');
    const archive = jobs['calendar-native'].steps.find((step) =>
      step.run?.includes('tar -czf')
    );
    assert.ok(
      archive.run.startsWith(
        'node scripts/ci/calendar-native-artifact.mjs verify '
      )
    );
    const commands = archive.run.split('\n').slice(1).join('\n');
    fixture(({ app, put }) => {
      if (saved) savePointer(app);
      put('.void/private-state.json', 'must not ship');
      const receipt = manifest(app, sha);
      put('calendar-artifact.json', receipt);
      const sandbox = mkdtempSync(resolve(tmpdir(), 'calendar-archive-'));
      try {
        mkdirSync(resolve(sandbox, 'apps'));
        cpSync(app, resolve(sandbox, 'apps/calendar'), { recursive: true });
        const packed = spawnSync('bash', ['-e', '-c', commands], {
          cwd: sandbox,
          env: { ...process.env, RUNNER_TEMP: sandbox },
          encoding: 'utf8',
          timeout: 10000,
        });
        assert.equal(packed.status, 0, packed.stderr);
        const restored = resolve(sandbox, 'restored');
        mkdirSync(restored);
        const unpacked = spawnSync(
          'tar',
          ['-xzf', resolve(sandbox, 'calendar-worker.tar.gz'), '-C', restored],
          {
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        assert.equal(unpacked.status, 0, unpacked.stderr);
        verify(
          restored,
          JSON.parse(
            readFileSync(resolve(restored, 'calendar-artifact.json'), 'utf8')
          ),
          sha
        );
        assert.throws(
          () => readFileSync(resolve(restored, '.void/private-state.json')),
          { code: 'ENOENT' }
        );
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });
}
