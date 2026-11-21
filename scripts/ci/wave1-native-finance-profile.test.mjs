import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepare, verify } from './wave1-native-artifact.mjs';
import { assertRouteFree } from './wave1-native-production.mjs';
import {
  profileFor,
  profiles,
  publicationConfig,
} from './wave1-native-profile.mjs';
import {
  assertReleaseInputs,
  FINANCE_PRODUCTION_HOST,
} from './wave1-release-inputs.mjs';

const require = createRequire(import.meta.url);
const { financeVars, fixture } = require('./wave1-native-test-fixture.cjs');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const root = fileURLToPath(new URL('../..', import.meta.url));
const sha = 'a'.repeat(40);
const financeProfiles = JSON.parse(
  readFileSync(
    join(root, 'apps/finance/cloudflare/native-profiles.json'),
    'utf8'
  )
);
const emittedConfig = (dir) => join(dir, 'dist/server/wrangler.json');
const mutateBase = (dir, change) => {
  const base = JSON.parse(readFileSync(emittedConfig(dir), 'utf8'));
  writeFileSync(emittedConfig(dir), JSON.stringify(change(base)));
};

test('the Finance wave-1 entry mirrors the reviewed native production profile', () => {
  const finance = profiles.apps.finance;
  const production = financeProfiles.production;
  assert.equal(finance.productionWorker, production.workerName);
  assert.equal(finance.canonicalHost, production.rootHost);
  assert.deepEqual(finance.releaseRecipe.mountHosts, ['https://tuturuuu.com']);
  assert.deepEqual(finance.sourceVars, production.vars);
  assert.deepEqual(financeVars, production.vars);
  const voidConfig = readFileSync(
    join(root, 'apps/finance/void.config.ts'),
    'utf8'
  );
  assert.match(
    voidConfig,
    new RegExp(`compatibility_date: '${finance.compatibilityDate}'`)
  );
  assert.equal(
    new URL(production.vars.NEXT_PUBLIC_SUPABASE_URL).host,
    FINANCE_PRODUCTION_HOST
  );
  // The Worker refuses to start without these two (vite.config.mts).
  for (const name of [
    'TUTURUUU_APP_COORDINATION_SECRET',
    'SUPABASE_SECRET_KEY',
  ])
    assert.ok(finance.secrets.includes(name), name);
  for (const name of finance.secrets)
    assert.ok(!Object.hasOwn(finance.sourceVars, name), name);
});

test('Finance publishes production only', (t) => {
  assert.throws(
    () => profileFor('finance', 'staging', 'owner-example'),
    /publishes production only/
  );
  const dir = fixture(t, 'finance');
  assert.throws(
    () => prepare(dir, 'finance', 'staging', 'owner-example', sha),
    /publishes production only/
  );
  const production = profileFor('finance', 'production');
  assert.equal(production.name, 'tuturuuu-finance');
  assert.equal(production.host, 'finance.tuturuuu.com');
});

test('Finance production seal keeps the emitted vars and a route-free relocatable config', (t) => {
  const dir = fixture(t, 'finance');
  const receipt = prepare(dir, 'finance', 'production', undefined, sha);
  const { config } = verify(dir, 'finance', 'production', sha);
  const emitted = JSON.parse(readFileSync(config, 'utf8'));
  assertRouteFree(emitted);
  assert.equal(emitted.name, 'tuturuuu-finance');
  assert.equal(emitted.account_id, profiles.accountId);
  assert.equal(emitted.compatibility_date, '2026-10-12');
  assert.deepEqual(emitted.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  assert.deepEqual(emitted.vars, financeProfiles.production.vars);
  assert.deepEqual(emitted.secrets.required, [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TUTURUUU_APP_COORDINATION_SECRET',
  ]);
  assert.equal(emitted.workers_dev, false);
  assert.equal(emitted.preview_urls, false);
  assert.equal(emitted.upload_source_maps, false);
  assert.deepEqual(emitted.routes, []);
  const relocated = `${dir}-restore`;
  t.after(() => rmSync(relocated, { recursive: true, force: true }));
  mkdirSync(relocated);
  const archive = join(dir, 'native.tar.gz');
  for (const args of [
    ['pack', dir, archive],
    ['restore', relocated, archive],
  ])
    execFileSync('python3', ['scripts/ci/wave1-native-archive.py', ...args], {
      cwd: root,
    });
  assert.deepEqual(
    verify(relocated, 'finance', 'production', sha).receipt,
    receipt
  );
});

for (const [name, change, message] of [
  [
    'a staging-profile build',
    (base) => ({ ...base, name: financeProfiles.staging.workerName }),
    /Unexpected original Worker identity/,
  ],
  [
    'staging vars',
    (base) => ({ ...base, vars: financeProfiles.staging.vars }),
    /Source vars require explicit profile review/,
  ],
  [
    'an added var',
    (base) => ({ ...base, vars: { ...base.vars, TUTURUUU_NOINDEX: '1' } }),
    /Source vars require explicit profile review/,
  ],
  [
    'a missing var',
    (base) => ({
      ...base,
      vars: Object.fromEntries(
        Object.entries(base.vars).filter(
          ([key]) => key !== 'INTERNAL_WEB_API_ORIGIN'
        )
      ),
    }),
    /Source vars require explicit profile review/,
  ],
  [
    'another compatibility date',
    (base) => ({ ...base, compatibility_date: '2026-10-19' }),
    /2026-10-12/,
  ],
  [
    'other compatibility flags',
    (base) => ({ ...base, compatibility_flags: ['nodejs_compat'] }),
    /global_fetch_strictly_public/,
  ],
  [
    'a source resource',
    (base) => ({
      ...base,
      services: [{ binding: 'FOREIGN', service: 'tuturuuu-web' }],
    }),
    /Unexpected source service bindings/,
  ],
  [
    'a static asset fallback',
    (base) => ({
      ...base,
      assets: { ...base.assets, not_found_handling: 'single-page-application' },
    }),
    /not_found_handling|none/,
  ],
]) {
  test(`Finance production seal refuses ${name}`, (t) => {
    const dir = fixture(t, 'finance');
    mutateBase(dir, change);
    assert.throws(
      () => prepare(dir, 'finance', 'production', undefined, sha),
      message
    );
  });
}

test('Finance secret names never duplicate a bound var', () => {
  const profile = profileFor('finance', 'production');
  const base = {
    name: 'tuturuuu-finance',
    no_bundle: true,
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    vars: financeVars,
    services: [
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
    assets: {
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  const options = { main: 'index.js', assets: 'client', sourceSha: sha };
  assert.ok(publicationConfig(base, profile, options));
  assert.throws(
    () =>
      publicationConfig(
        base,
        {
          ...profile,
          secrets: [...profile.secrets, 'NEXT_PUBLIC_SUPABASE_URL'],
        },
        options
      ),
    /Secret name duplicates a source var: NEXT_PUBLIC_SUPABASE_URL/
  );
  assert.throws(
    () => publicationConfig(base, profile, { ...options, sourceSha: '' }),
    /Exact Finance production source required/
  );
});

test('Finance release inputs admit only the production Supabase host', () => {
  const env = {
    APP: 'finance',
    NEXT_PUBLIC_SUPABASE_URL: `https://${FINANCE_PRODUCTION_HOST}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_finance_production',
  };
  assert.match(assertReleaseInputs(env), /^[a-f0-9]{64}$/);
  assert.throws(
    () =>
      assertReleaseInputs({
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: 'https://fxefojytwimjiqxseqag.supabase.co',
      }),
    /Finance production URL host is not the admitted host/
  );
});

test('the producer builds Finance with its Void production profile and qualifies it before sealing', () => {
  const workflow = readWorkflow('wave1-native-production.yaml');
  const steps = workflow.jobs.qualify.steps;
  const index = (name) => steps.findIndex((step) => step.name === name);
  const generic =
    steps[index('Build admitted production frontend and transitive suppliers')];
  assert.equal(generic.if, "${{ inputs.app != 'finance' }}");
  assert.equal(
    generic.with.command,
    'bun turbo:local run build --filter=@tuturuuu/${{ inputs.app }} --concurrency=2'
  );
  const suppliers = steps[index('Build Finance workspace suppliers')];
  const worker = steps[index('Build the Finance production native Worker')];
  const qualify =
    steps[index('Qualify the emitted Finance production profile')];
  for (const step of [suppliers, worker, qualify])
    assert.equal(step.if, "${{ inputs.app == 'finance' }}");
  assert.equal(
    suppliers.with.command,
    'bun turbo:local run build --filter="@tuturuuu/finance^..." --concurrency=2'
  );
  assert.equal(suppliers.with.token, '');
  assert.equal(
    worker.with.command,
    'cd apps/finance && bun run build:cloudflare'
  );
  assert.equal(worker.with.token, '');
  assert.equal(worker.env.VITE_FINANCE_NATIVE_PROFILE, 'production');
  assert.equal(qualify.env.VITE_FINANCE_NATIVE_PROFILE, 'production');
  assert.equal(
    qualify.run,
    'python3 scripts/ci/finance-native-artifact.py config apps/finance'
  );
  const metadata = index('Generate exact source metadata');
  const seal = index('Prepare the production profile and receipt');
  assert.ok(metadata < index('Build Finance workspace suppliers'));
  assert.ok(
    index('Build Finance workspace suppliers') <
      index('Build the Finance production native Worker')
  );
  assert.ok(
    index('Build the Finance production native Worker') <
      index('Qualify the emitted Finance production profile')
  );
  assert.ok(index('Qualify the emitted Finance production profile') < seal);
  for (const step of [suppliers, worker, qualify])
    assert.doesNotMatch(JSON.stringify(step), /secrets\./);
  const doctor = steps[index('Pre-seal doctor on the production Host header')];
  assert.match(
    doctor.run,
    /\[ "\$APP" = calendar \] \|\| \[ "\$APP" = mail \] \|\| \[ "\$APP" = finance \]; then FLAGS\+=\(--expect-redirect\)/
  );
  assert.ok(workflow.jobs.publish.needs.includes('production-policy'));
  assert.match(
    workflow.jobs['production-policy'].steps.at(-1).run,
    /"\$APP-cloudflare\.yaml"/
  );
});

test('the configure step writes the same public URLs for existing apps and only profile URLs for Finance', () => {
  const step = readWorkflow(
    'wave1-native-production.yaml'
  ).jobs.qualify.steps.find(
    (item) =>
      item.name === 'Configure exact production public inputs and identity'
  );
  const scratch = mkdtempSync(join(tmpdir(), 'wave1-finance-configure-'));
  try {
    const bin = join(scratch, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/bash\nprintf "%s\\n" "$SOURCE_SHA"\n'
    );
    chmodSync(join(bin, 'git'), 0o700);
    const script = join(scratch, 'step.sh');
    writeFileSync(script, step.run);
    const run = (app) => {
      const githubEnv = join(scratch, `${app}.env`);
      writeFileSync(githubEnv, '');
      const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', script], {
        cwd: resolve(root),
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          APP: app,
          SOURCE_SHA: sha,
          RELEASE_ARTIFACT: 'false',
          GITHUB_ENV: githubEnv,
          NEXT_PUBLIC_SUPABASE_URL: `https://${FINANCE_PRODUCTION_HOST}`,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return readFileSync(githubEnv, 'utf8');
    };
    for (const app of ['calendar', 'mail', 'apps']) {
      const host = profileFor(app, 'production').host;
      assert.equal(
        run(app),
        `NEXT_PUBLIC_APP_URL=https://${host}\nNEXT_PUBLIC_${app.toUpperCase()}_APP_URL=https://${host}\nNEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com\n`
      );
    }
    assert.equal(
      run('finance'),
      'NEXT_PUBLIC_APP_URL=https://finance.tuturuuu.com\nNEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com\n'
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
