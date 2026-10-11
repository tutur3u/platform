import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  inventory,
  main,
  probeCli,
  readiness,
  readSettings,
} from './declarative-schema-readiness.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'declarative-readiness-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = path.join(root, 'apps/database');
  fs.mkdirSync(path.join(db, 'supabase/migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(db, 'supabase/config.toml'),
    '[db]\nmajor_version = 17\n'
  );
  fs.writeFileSync(
    path.join(db, 'package.json'),
    JSON.stringify({ devDependencies: { supabase: '2.117.0' } })
  );
  fs.writeFileSync(
    path.join(db, 'supabase/migrations/20260101000000_init.sql'),
    'create table public.example(id int);'
  );
  fs.writeFileSync(path.join(root, 'bun.lock'), 'fixture-lock');
  return { root, db };
}

const supported = () => ({
  installedVersion: '2.117.0',
  binarySha256: 'fixture',
  generate: true,
  sync: true,
});

test('inventory binds migration bytes and includes nested schema objects', (t) => {
  const { root, db } = fixture(t);
  const first = readiness(root, { probe: supported });
  assert.equal(first.migrations.length, 1);
  fs.appendFileSync(
    path.join(db, 'supabase/migrations/20260101000000_init.sql'),
    '\n-- changed'
  );
  fs.mkdirSync(path.join(db, 'supabase/schemas/private/functions'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(db, 'supabase/schemas/private/functions/example.sql'),
    '-- DDL'
  );
  const second = readiness(root, { probe: supported });
  assert.notEqual(
    first.identity.migrationsSha256,
    second.identity.migrationsSha256
  );
  assert.equal(second.schemas[0].path, 'private/functions/example.sql');
  assert.equal(JSON.stringify(second).includes('create table'), false);
});

test('a complete-looking tree and supported CLI cannot self-attest a baseline', (t) => {
  const { root, db } = fixture(t);
  fs.appendFileSync(
    path.join(db, 'supabase/config.toml'),
    '[experimental.pgdelta]\nenabled = true\n'
  );
  fs.mkdirSync(path.join(db, 'supabase/schemas'));
  fs.writeFileSync(path.join(db, 'supabase/schemas/example.sql'), '-- DDL');
  const report = readiness(root, { probe: supported });
  assert.equal(report.ready, false);
  assert.equal(report.status, 'preparation');
  assert.deepEqual(report.blockers, [
    'baseline-replay-and-noop-diff-unverified',
    'migration-owner-reconciliation-required',
  ]);
});

test('version mismatch and legacy engine fail closed', (t) => {
  const { root } = fixture(t);
  const report = readiness(root, {
    probe: () => ({ ...supported(), installedVersion: '2.118.0', sync: false }),
  });
  for (const code of [
    'cli-version-unbound',
    'cli-declarative-commands-unsupported',
    'pgdelta-not-enabled',
    'schema-tree-missing',
  ]) {
    assert.ok(report.blockers.includes(code));
  }
});

test('duplicate migration timestamps and symlinked inputs are rejected', (t) => {
  const { root, db } = fixture(t);
  fs.writeFileSync(
    path.join(db, 'supabase/migrations/20260101000000_duplicate.sql'),
    '-- DDL'
  );
  assert.ok(
    readiness(root, { probe: supported }).blockers.includes(
      'migration-history-invalid'
    )
  );
  fs.symlinkSync(
    path.join(root, 'bun.lock'),
    path.join(db, 'supabase/migrations/linked.sql')
  );
  assert.throws(
    () => inventory(path.join(db, 'supabase/migrations')),
    /inventory-symlink/
  );
});

test('settings distinguish engine and legacy ordering without accepting ambiguous major versions', () => {
  assert.deepEqual(
    readSettings(
      '[db]\nmajor_version = 17 # pinned\n[db.migrations]\nschema_paths = [\n "./schemas/*.sql",\n]\n[experimental.pgdelta]\nenabled = true\n'
    ),
    {
      postgresMajor: 17,
      engine: 'pg-delta',
      legacySchemaPathsPresent: true,
    }
  );
  assert.equal(
    readSettings('[db]\nmajor_version = "17"\n').postgresMajor,
    null
  );
  assert.throws(() => readSettings('[db]\n[db]\n'), /duplicate-config-section/);
});

test('CLI absence never invokes an installer or global binary', (t) => {
  const { db } = fixture(t);
  let invoked = false;
  assert.equal(
    probeCli(db, {
      runner: () => {
        invoked = true;
      },
    }).installedVersion,
    null
  );
  assert.equal(invoked, false);
});

test('CLI help must describe the exact command and required safety flags', (t) => {
  const { db } = fixture(t);
  const wrapper = path.join(db, 'node_modules/supabase');
  const native = path.join(
    wrapper,
    'node_modules/@supabase',
    `cli-${process.platform}-${process.arch}`
  );
  fs.mkdirSync(path.join(native, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(wrapper, 'package.json'),
    JSON.stringify({ bin: { supabase: 'wrapper.js' } })
  );
  fs.writeFileSync(path.join(wrapper, 'wrapper.js'), '');
  fs.writeFileSync(path.join(native, 'package.json'), '{}');
  fs.writeFileSync(path.join(native, 'bin/supabase'), 'fixture binary');
  const calls = [];
  const runner = (_binary, args, options) => {
    calls.push(args);
    assert.equal(options.timeout, 10000);
    assert.equal(options.env.SUPABASE_NO_UPDATE_NOTIFIER, '1');
    assert.deepEqual(Object.keys(options.env).sort(), [
      'NO_COLOR',
      'PATH',
      'SUPABASE_NO_UPDATE_NOTIFIER',
    ]);
    return {
      status: 0,
      stdout:
        args[0] === '--version'
          ? '2.117.0\n'
          : 'Usage: supabase db [command]\n--local --no-apply',
    };
  };
  const unsupported = probeCli(db, { runner });
  assert.equal(unsupported.generate, false);
  assert.equal(unsupported.sync, false);
  assert.deepEqual(calls, [
    ['--version'],
    ['db', 'schema', 'declarative', 'generate', '--help'],
    ['db', 'schema', 'declarative', 'sync', '--help'],
  ]);
  assert.equal(
    probeCli(db, {
      runner: (_binary, args) => ({
        status: 0,
        stdout:
          args[0] === '--version'
            ? '2.117.0'
            : `Usage: supabase ${args.slice(0, -1).join(' ')}\n--local --no-apply`,
      }),
    }).sync,
    true
  );
});

test('connection, write, and unknown arguments are refused before any inspection', () => {
  for (const args of [
    ['--linked'],
    ['--db-url', 'secret'],
    ['--apply'],
    ['--experimental'],
    ['--overwrite'],
    ['--json', '--yes'],
  ]) {
    let output = '';
    const stream = {
      write: (value) => {
        output += value;
      },
    };
    assert.equal(
      main(args, {
        stdout: stream,
        stderr: stream,
        probe: () => {
          throw new Error('must not probe');
        },
      }),
      1
    );
    assert.equal(output.includes('secret'), false);
    assert.match(output, /Unsupported argument/);
  }
});

test('report exits held, help succeeds, and failures do not echo sensitive details', (t) => {
  const { root } = fixture(t);
  let output = '';
  const stream = {
    write: (value) => {
      output += value;
    },
  };
  assert.equal(
    main(['--json'], {
      root,
      stdout: stream,
      stderr: stream,
      probe: supported,
    }),
    2
  );
  assert.equal(JSON.parse(output).ready, false);
  output = '';
  assert.equal(main(['--help'], { stdout: stream }), 0);
  output = '';
  assert.equal(
    main([], {
      root,
      stdout: stream,
      stderr: stream,
      probe: () => {
        throw new Error('credential-private');
      },
    }),
    1
  );
  assert.equal(output.includes('credential-private'), false);
});
