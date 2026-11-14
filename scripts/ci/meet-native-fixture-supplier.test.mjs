import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  admitMeetFixtureReceipt,
  admitMeetFixtureEnvelope,
  admitFixtureArchiveListing,
  portableMeetGraph,
  runFixtureStage,
  restoreMeetFixture,
} from './meet-native-fixture-supplier.mjs';
import {
  createMeetProductionInputs,
  admitMeetProductionInputs,
  PRODUCTION_PROFILE,
  sealMeetApp,
} from './meet-native-inventory.mjs';
import {
  inspectMeetGraph,
  assertMeetOriginal,
  hash,
} from './meet-native-profile.mjs';
import {
  prepareMeetGraph,
  assertMeetCopy,
} from './meet-native-graph-files.mjs';
import { meetFixture } from './meet-native-fixture.mjs';
import {
  mkdir,
  readFile,
  writeFile,
  symlink,
  mkdtemp,
  realpath,
  rm,
  readdir,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { meetChildEnvironment } from './meet-native-launcher.mjs';
const { readWorkflow } = createRequire(import.meta.url)(
  './workflow-yaml-test-helper.js'
);

test('Meet fixture receipts bind producer and graph identities', () => {
  const identity = {
    sourceSHA: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    ownerPackageHash: 'c'.repeat(64),
    lockHash: 'd'.repeat(64),
  };
  const plan = {
    profile: 'meet-emitted-v1',
    sourceSHA: identity.sourceSHA,
    app: '/fixture/source/apps/meet',
    ownerPackage: '/fixture/source/apps/meet/package.json',
    lockPath: '/fixture/source/bun.lock',
    ownerPackageHash: identity.ownerPackageHash,
    lockHash: identity.lockHash,
    manifestHash: 'e'.repeat(64),
    pointerHash: 'f'.repeat(64),
    config: { main: 'main.mjs' },
    seal: { 'main.mjs': '1'.repeat(64) },
  };
  const context = { identity, root: '/fixture', archiveHash: '2'.repeat(64) };
  const receipt = {
    schema: 2,
    purpose: 'fixture-validation-only',
    identity,
    sourceArchiveHash: context.archiveHash,
    layout: {
      app: 'source/apps/meet',
      owner: 'source/apps/meet/package.json',
      lock: 'source/bun.lock',
    },
    graph: portableMeetGraph(plan),
    producer: {
      dependencyInstall: 'bun install --frozen-lockfile',
      dependencies:
        'bun turbo:local run build --filter=@tuturuuu/meet-core^... --concurrency=2',
      frontend: 'bun run build:cloudflare',
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://meet-ci.supabase.invalid',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          'sb_publishable_meet_ci_placeholder',
        NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
        NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      },
    },
  };
  assert.doesNotThrow(() => admitMeetFixtureEnvelope(receipt, identity));
  assert.doesNotThrow(() => admitMeetFixtureReceipt(receipt, context, plan));
  for (const mutate of [
    (r) => {
      r.identity.sourceSHA = '0'.repeat(40);
    },
    (r) => {
      r.identity.sourceTree = '0'.repeat(40);
    },
    (r) => {
      r.identity.ownerPackageHash = '0'.repeat(64);
    },
    (r) => {
      r.identity.lockHash = '0'.repeat(64);
    },
    (r) => {
      r.sourceArchiveHash = '0'.repeat(64);
    },
    (r) => {
      r.layout.app = '/production/apps/meet';
    },
    (r) => {
      r.layout.owner = '../production/package.json';
    },
    (r) => {
      r.layout.extra = 'not-admitted';
    },
    (r) => {
      r.graph.profile = PRODUCTION_PROFILE;
    },
    (r) => {
      r.graph.manifestHash = '0'.repeat(64);
    },
    (r) => {
      r.graph.pointerHash = '0'.repeat(64);
    },
    (r) => {
      r.graph.config.main = 'other.mjs';
    },
    (r) => {
      r.graph.seal['main.mjs'] = '0'.repeat(64);
    },
    (r) => {
      r.producer.environment.EXTRA_INPUT = 'unexpected';
    },
    (r) => {
      r.purpose = 'production-qualified';
    },
    (r) => {
      r.extra = true;
    },
    (r) => {
      delete r.sourceArchiveHash;
    },
  ]) {
    const invalid = structuredClone(receipt);
    mutate(invalid);
    assert.throws(
      () => admitMeetFixtureReceipt(invalid, context, plan),
      assert.AssertionError
    );
  }
});

test('fixture identity survives canonical relocation without admitting path authority', () => {
  const names = ['source.tar', 'receipt.json', 'artifact.tar.gz'];
  admitFixtureArchiveListing(names, ['-', '-', '-'], true);
  for (const [paths, types] of [
    [
      ['../receipt.json', 'source.tar', 'artifact.tar.gz'],
      ['-', '-', '-'],
    ],
    [names, ['l', '-', '-']],
    [names, ['h', '-', '-']],
    [
      [...names, 'extra'],
      ['-', '-', '-', '-'],
    ],
    [
      ['receipt.json', 'receipt.json', 'artifact.tar.gz'],
      ['-', '-', '-'],
    ],
  ])
    assert.throws(() => admitFixtureArchiveListing(paths, types, true));
  admitFixtureArchiveListing(
    ['dist/', 'dist/server/main.mjs', 'meet-artifact.json'],
    ['d', '-', '-']
  );
  for (const name of [
    '/dist/a',
    'dist/../outside',
    'dist/a\n../b',
    'credentials.json',
  ])
    assert.throws(() => admitFixtureArchiveListing([name], ['-']));
  const graph = {
    profile: 'meet-emitted-v1',
    sourceSHA: 'a'.repeat(40),
    app: '/first/apps/meet',
    root: '/first/apps/meet/dist',
    ownerPackage: '/first/apps/meet/package.json',
    lockPath: '/first/bun.lock',
    manifestPath: '/first/apps/meet/meet-artifact.json',
    pointerPath: '/first/apps/meet/.void/preview-deploy-config.json',
    probePath: '/first/scripts/ci/meet-native-probe.mjs',
    configRelative: 'server/wrangler.json',
    manifestHash: 'b'.repeat(64),
    seal: { 'server/main.mjs': 'c'.repeat(64) },
  };
  const relocated = structuredClone(graph);
  for (const name of [
    'app',
    'root',
    'ownerPackage',
    'lockPath',
    'manifestPath',
    'pointerPath',
    'probePath',
  ])
    relocated[name] = graph[name].replace('/first', '/second');
  assert.deepEqual(portableMeetGraph(graph), portableMeetGraph(relocated));
  relocated.seal['server/main.mjs'] = 'd'.repeat(64);
  assert.notDeepEqual(portableMeetGraph(graph), portableMeetGraph(relocated));
});

async function productionGraph(t) {
  const f = await meetFixture(t, { server: 'server' });
  const values = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_production_control',
    NEXT_PUBLIC_SUPABASE_URL: 'https://production-control.supabase.invalid',
  };
  const identity = {
    sourceSHA: f.options.sourceSHA,
    sourceTree: 'b'.repeat(40),
    ownerPackageHash: hash(await readFile(f.options.ownerPackage)),
    lockHash: hash(await readFile(join(f.root, 'bun.lock'))),
  };
  const proof = createMeetProductionInputs(identity, values);
  await mkdir(join(f.app, 'dist/server/.vite'));
  await writeFile(
    join(f.app, 'dist/client/.assetsignore'),
    'wrangler.json\n.dev.vars\n'
  );
  await writeFile(
    join(f.app, 'dist/server/.vite/manifest.json'),
    JSON.stringify({ 'main.ts': { file: 'main.mjs', isEntry: true } })
  );
  await writeFile(
    join(f.app, 'dist/server/.dev.vars'),
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='${values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}'\nNEXT_PUBLIC_SUPABASE_URL='${values.NEXT_PUBLIC_SUPABASE_URL}'\n`
  );
  await f.save();
  const admission = { profile: PRODUCTION_PROFILE, productionProof: proof };
  return {
    ...f,
    admission,
    proof,
    identity,
    options: { ...f.options, admission },
  };
}

test('production profile preserves original bytes through copy and finalization checks', async (t) => {
  const f = await productionGraph(t);
  const before = await readFile(join(f.app, 'dist/server/.dev.vars'));
  await assert.rejects(
    sealMeetApp(join(f.app, 'dist'), {
      configRelative: 'server/wrangler.json',
      assetsRelative: 'client',
    }),
    /exact public CI fixture/
  );
  const plan = await inspectMeetGraph(f.options);
  assert.equal(plan.profile, PRODUCTION_PROFILE);
  assert.equal(plan.seal['server/.dev.vars'], f.proof.devVars.sha256);
  const prepared = await prepareMeetGraph(plan, f.context);
  await assertMeetCopy(plan, prepared, true);
  await assertMeetOriginal(plan);
  assert.deepEqual(
    await readFile(join(f.app, 'dist/server/.dev.vars')),
    before
  );
  assert.deepEqual(
    await readFile(join(prepared.roles.app.root, 'server/.dev.vars')),
    before
  );
});

test('production admission refuses unknown profiles, missing provenance and changed identities', async (t) => {
  const f = await productionGraph(t);
  const plan = await inspectMeetGraph(f.options);
  for (const admission of [
    null,
    {},
    { profile: 'unknown', productionProof: f.proof },
    { profile: PRODUCTION_PROFILE },
    { ...f.admission, extra: true },
  ])
    await assert.rejects(inspectMeetGraph({ ...f.options, admission }));
  await assert.rejects(
    inspectMeetGraph({
      ...f.options,
      appDirectory: '/missing-output',
      admission: { profile: PRODUCTION_PROFILE, productionProof: null },
    }),
    assert.AssertionError
  );
  const defaultOptions = { ...f.options };
  delete defaultOptions.admission;
  await assert.rejects(
    inspectMeetGraph(defaultOptions),
    /exact public CI fixture/
  );
  for (const mutate of [
    (p) => {
      p.devVars.sha256 = '0'.repeat(64);
    },
    (p) => {
      p.devVars.bytes += 1;
    },
    (p) => {
      p.devVars.names.push('SUPABASE_SECRET_KEY');
    },
    (p) => {
      p.identity.sourceSHA = '0'.repeat(40);
    },
    (p) => {
      p.identity.ownerPackageHash = '0'.repeat(64);
    },
    (p) => {
      p.identity.lockHash = '0'.repeat(64);
    },
    (p) => {
      p.extra = true;
    },
  ]) {
    const proof = structuredClone(f.proof);
    mutate(proof);
    await assert.rejects(
      inspectMeetGraph({
        ...f.options,
        admission: { profile: PRODUCTION_PROFILE, productionProof: proof },
      })
    );
  }
  await writeFile(
    join(f.app, 'dist/server/.dev.vars'),
    'unexpected-public-inputs'
  );
  await f.save();
  await assert.rejects(
    inspectMeetGraph(f.options),
    /input (byte count|digest)/
  );
  await assert.rejects(assertMeetOriginal(plan));
});

test('production inputs require exact closed names and lossless public serialization', () => {
  const identity = {
    sourceSHA: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    ownerPackageHash: 'c'.repeat(64),
    lockHash: 'd'.repeat(64),
  };
  const values = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public_control',
    NEXT_PUBLIC_SUPABASE_URL: 'https://control.invalid',
  };
  const proof = createMeetProductionInputs(identity, values);
  admitMeetProductionInputs(proof, identity);
  assert.throws(() =>
    createMeetProductionInputs(identity, {
      ...values,
      SUPABASE_SECRET_KEY: 'forbidden',
    })
  );
  assert.throws(() =>
    createMeetProductionInputs(identity, {
      ...values,
      NEXT_PUBLIC_SUPABASE_URL: 'line1\nline2',
    })
  );
  assert.throws(() =>
    admitMeetProductionInputs({ ...proof, profile: 'unknown' })
  );
  assert.throws(() =>
    admitMeetProductionInputs(proof, {
      ...identity,
      sourceTree: '0'.repeat(40),
    })
  );
});

test('production inventory rejects extra credential files and symlinked output', async (t) => {
  const f = await productionGraph(t);
  await writeFile(join(f.app, 'dist/server/.env'), 'forbidden');
  await f.save();
  await assert.rejects(inspectMeetGraph(f.options));
  const other = await productionGraph(t);
  await symlink(
    join(other.app, 'dist/server/main.mjs'),
    join(other.app, 'dist/server/link.mjs')
  );
  await assert.rejects(inspectMeetGraph(other.options));
});

test('all production consumers select original graph provenance rather than fixture-only proof', () => {
  const workflow = readWorkflow('meet-cloudflare.yaml');
  const steps = workflow.jobs.validate.steps;
  const build = steps.find((step) => step.id === 'meet-frontend-build');
  assert.ok(
    build.with.command.indexOf(' inputs ') <
      build.with.command.indexOf('bun run build:cloudflare')
  );
  const seal = steps.findIndex((step) => step.id === 'meet-canonical-seal');
  const bind = steps.findIndex(
    (step) => step.name === 'Bind production compiler inputs to emitted graph'
  );
  const production = steps.findIndex(
    (step) => step.name === 'Verify production emitted Start runtime'
  );
  assert.ok(bind > seal && production > bind);
  for (const [job, name] of [
    ['validate', 'Verify production emitted Start runtime'],
    ['restored-artifact', 'Verify restored production emitted runtime'],
    ['deploy', 'Verify restored Start runtime before production writes'],
  ]) {
    const actor = workflow.jobs[job].steps.find((step) => step.name === name);
    assert.match(actor.run, /--production-receipt/);
    assert.doesNotMatch(actor.run, /--fixture-receipt/);
    assert.notEqual(actor['continue-on-error'], true);
    const expectedCondition =
      job === 'deploy' ? undefined : "github.ref == 'refs/heads/production'";
    const assertGate = (candidate) => {
      assert.equal(candidate.if, expectedCondition);
      assert.notEqual(candidate['continue-on-error'], true);
      assert.match(candidate.run, /--production-receipt/);
      assert.doesNotMatch(candidate.run, /--fixture-receipt/);
    };
    assertGate(actor);
    for (const candidate of [
      { ...actor, if: 'false' },
      { ...actor, 'continue-on-error': true },
      {
        ...actor,
        run: actor.run.replace('--production-receipt', '--fixture-receipt'),
      },
    ])
      assert.throws(() => assertGate(candidate), assert.AssertionError);
  }
  for (const job of ['restored-artifact', 'deploy']) {
    const actors = workflow.jobs[job].steps;
    const fixture = actors.find((step) => step.id === 'meet-restored-fixture');
    assert.match(fixture.run, /supplier\.mjs restore/);
    const download = actors.find(
      (step) => step.name === 'Download production provenance'
    );
    assert.equal(
      download.with.name,
      'meet-production-provenance-${{ env.SOURCE_SHA }}'
    );
    assert.ok(
      actors.indexOf(download) <
        actors.findIndex((step) => /--production-receipt/.test(step.run ?? ''))
    );
  }
  const dryrun = workflow.jobs.deploy.steps.find(
    (step) => step.name === 'Dry-run restored frontend artifact'
  );
  assert.match(dryrun.run, /--production-receipt/);
});

test('child build identity follows the admitted graph instead of ambient production ref', () => {
  const context = {
    caseRoot: '/case',
    tempRoot: '/case/temp',
    planFile: '/case/plan',
    receiptFile: '/case/receipt',
    sourceSHA: 'a'.repeat(40),
  };
  const fixture = meetChildEnvironment(
    { GITHUB_REF: 'refs/heads/production' },
    { ...context, profile: 'meet-emitted-v1' }
  );
  assert.equal(fixture.GITHUB_REF, 'refs/heads/ci-fixture');
  const production = meetChildEnvironment(
    { GITHUB_REF: 'refs/heads/ci-fixture' },
    { ...context, profile: PRODUCTION_PROFILE }
  );
  assert.equal(production.GITHUB_REF, 'refs/heads/production');
  assert.throws(() =>
    meetChildEnvironment({}, { ...context, profile: 'unknown' })
  );
});

test('fixture producer observes owned child close and refuses a bounded timeout', async () => {
  const before = {
    term: process.listenerCount('SIGTERM'),
    int: process.listenerCount('SIGINT'),
  };
  const control = await runFixtureStage(
    process.execPath,
    ['-e', 'process.stdout.write("fixture-stage-control\\n")'],
    process.cwd(),
    { PATH: process.env.PATH },
    5_000
  );
  assert.equal(control.exitCode, 0);
  assert.equal(control.closeObserved, true);
  assert.equal(control.stdioDrained, true);
  await assert.rejects(
    runFixtureStage(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      process.cwd(),
      { PATH: process.env.PATH },
      50
    ),
    (error) => {
      assert.match(error.message, /Fixture stage deadline exceeded/);
      assert.equal(error.facts.timedOut, true);
      assert.equal(error.facts.closeObserved, true);
      assert.equal(error.facts.stdioDrained, true);
      return true;
    }
  );
  assert.equal(process.listenerCount('SIGTERM'), before.term);
  assert.equal(process.listenerCount('SIGINT'), before.int);
});

test('transport extra fields refuse before source extraction or dependency installation', async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'meet-transport-negative-'))
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const git = (args) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  const sourceSHA = git(['rev-parse', 'HEAD']);
  const identity = {
    sourceSHA,
    sourceTree: git(['rev-parse', `${sourceSHA}^{tree}`]),
    ownerPackageHash: hash(
      await readFile(join(repository, 'apps/meet/package.json'))
    ),
    lockHash: hash(await readFile(join(repository, 'bun.lock'))),
  };
  const staging = join(root, 'staging');
  const parent = join(root, 'restores');
  await mkdir(staging);
  await mkdir(parent);
  const receipt = {
    schema: 2,
    purpose: 'fixture-validation-only',
    identity,
    sourceArchiveHash: '0'.repeat(64),
    layout: {
      app: 'source/apps/meet',
      owner: 'source/apps/meet/package.json',
      lock: 'source/bun.lock',
    },
    graph: { profile: 'meet-emitted-v1', sourceSHA },
    producer: {
      dependencyInstall: 'bun install --frozen-lockfile',
      dependencies:
        'bun turbo:local run build --filter=@tuturuuu/meet-core^... --concurrency=2',
      frontend: 'bun run build:cloudflare',
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://meet-ci.supabase.invalid',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          'sb_publishable_meet_ci_placeholder',
        NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
        NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      },
    },
  };
  admitMeetFixtureEnvelope(receipt, identity);
  await writeFile(
    join(staging, 'receipt.json'),
    JSON.stringify({ ...receipt, extra: true })
  );
  await writeFile(join(staging, 'source.tar'), 'not admitted source');
  await writeFile(join(staging, 'artifact.tar.gz'), 'not admitted output');
  const transport = join(root, 'transport.tar.gz');
  execFileSync(
    'tar',
    [
      '-czf',
      transport,
      '-C',
      staging,
      'source.tar',
      'receipt.json',
      'artifact.tar.gz',
    ],
    { timeout: 5000 }
  );
  await assert.rejects(
    restoreMeetFixture(sourceSHA, transport, parent),
    /Closed Meet fixture receipt/
  );
  const [created] = await readdir(parent);
  assert.ok(created);
  assert.equal(
    (await readdir(join(parent, created))).includes('source'),
    false
  );
  assert.equal(
    (await readdir(join(parent, created, 'home'))).includes('bun-cache'),
    false
  );
});
