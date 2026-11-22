import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  releaseRecipes,
} from './wave1-native-profile.mjs';
import {
  assertReleaseInputs,
  DRIVE_PRODUCTION_HOST,
} from './wave1-release-inputs.mjs';

const require = createRequire(import.meta.url);
const { driveVars, fixture } = require('./wave1-native-test-fixture.cjs');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const root = fileURLToPath(new URL('../..', import.meta.url));
const sha = 'a'.repeat(40);
const read = (path) => readFileSync(join(root, path), 'utf8');
const productionVars = JSON.parse(
  read('apps/drive/cloudflare/production-profile.json')
);
// The fixture's only JSON file in the server output is the emitted config.
const emittedConfig = (dir) =>
  join(
    dir,
    'dist/server',
    readdirSync(join(dir, 'dist/server')).find((name) => name.endsWith('.json'))
  );
const mutateBase = (dir, change) => {
  const base = JSON.parse(readFileSync(emittedConfig(dir), 'utf8'));
  writeFileSync(emittedConfig(dir), JSON.stringify(change(base)));
};

test('the Drive wave-1 entry mirrors the reviewed native production profile', () => {
  const drive = profiles.apps.drive;
  const recipe = releaseRecipes.drive;
  assert.equal(drive.productionWorker, 'tuturuuu-drive');
  assert.equal(drive.canonicalHost, 'drive.tuturuuu.com');
  assert.deepEqual(recipe.canonicalHosts, ['https://drive.tuturuuu.com']);
  assert.deepEqual(recipe.mountHosts, ['https://tuturuuu.com']);
  assert.deepEqual(drive.sourceVars, productionVars);
  assert.deepEqual(recipe.allowedVars, productionVars);
  assert.deepEqual(driveVars, productionVars);
  assert.equal(recipe.cf.productionOnly, true);
  assert.deepEqual(recipe.cf.admittedSourceServices, []);
  assert.deepEqual(recipe.publicInputPins, []);
  assert.match(
    read('apps/drive/void.config.ts'),
    new RegExp(`compatibility_date: '${recipe.cf.compatibilityDate}'`)
  );
  const bridge = read('apps/drive/start-bridge.config.ts');
  assert.match(bridge, /'drive\.tuturuuu\.com'/);
  assert.match(bridge, /mountHosts: production \? \['tuturuuu\.com'\]/);
  assert.match(bridge, /basePath: '\/drive'/);
});

test('Drive secrets are exactly the Worker bindings it refuses to start without', () => {
  const required = [
    ...read('apps/drive/cloudflare/required-bindings.ts').matchAll(
      /^ {2}'([A-Z0-9_]+)',$/gmu
    ),
  ].map((match) => match[1]);
  assert.equal(required.length, 4);
  assert.deepEqual(profiles.apps.drive.secrets, required);
  assert.deepEqual(releaseRecipes.drive.requiredSecretNames, required);
  for (const name of required)
    assert.ok(!Object.hasOwn(productionVars, name), name);
});

test('the Drive production vars keep Trusted Types report-only', () => {
  const vars = releaseRecipes.drive.allowedVars;
  // The bridge always enforces the nonce script policy. Trusted Types stays
  // report-only until a signed-in crawl is clean; enforcing it is a reviewed
  // profile change.
  assert.equal(vars.TTR_TRUSTED_TYPES_DRIVE, 'report');
  // No one-origin flag: the subdomain keeps serving and the mount is always on.
  assert.ok(
    !Object.keys(vars).some((name) => name.startsWith('TTR_ONE_ORIGIN'))
  );
  assert.equal(vars.INTERNAL_WEB_API_ORIGIN, 'https://tuturuuu.com');
  assert.equal(vars.DRIVE_NATIVE_PROFILE, 'production');
});

test('Drive smoke is the anonymous login handoff and the build identity', () => {
  assert.deepEqual(releaseRecipes.drive.smokeSpec.cases, [
    {
      path: '/',
      status: 307,
      redirectOrigin: 'https://tuturuuu.com',
      noStore: true,
    },
    {
      path: '/api/build-info',
      status: 200,
      redirectOrigin: null,
      noStore: true,
    },
  ]);
  assert.equal(releaseRecipes.drive.cf.doctorExpectations.expectRedirect, true);
});

test('Drive publishes production only', (t) => {
  assert.throws(
    () => profileFor('drive', 'staging', 'owner-example'),
    /publishes production only/
  );
  const dir = fixture(t, 'drive');
  assert.throws(
    () => prepare(dir, 'drive', 'staging', 'owner-example', sha),
    /publishes production only/
  );
  const production = profileFor('drive', 'production');
  assert.equal(production.name, 'tuturuuu-drive');
  assert.equal(production.host, 'drive.tuturuuu.com');
});

test('Drive production seal keeps the emitted vars and a route-free relocatable config', (t) => {
  const dir = fixture(t, 'drive');
  const receipt = prepare(dir, 'drive', 'production', undefined, sha);
  const { config } = verify(dir, 'drive', 'production', sha);
  const emitted = JSON.parse(readFileSync(config, 'utf8'));
  assertRouteFree(emitted);
  assert.equal(emitted.name, 'tuturuuu-drive');
  assert.equal(emitted.account_id, profiles.accountId);
  assert.equal(emitted.compatibility_date, '2026-10-12');
  assert.deepEqual(emitted.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  assert.deepEqual(emitted.vars, productionVars);
  assert.deepEqual(emitted.secrets.required, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TUTURUUU_APP_COORDINATION_SECRET',
  ]);
  assert.equal(emitted.services, undefined);
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
    verify(relocated, 'drive', 'production', sha).receipt,
    receipt
  );
});

for (const [name, change, message] of [
  [
    'a staging-profile build',
    (base) => ({ ...base, name: 'tuturuuu-drive-vite-staging' }),
    /Unexpected original Worker identity/,
  ],
  [
    'an unknown Trusted Types mode',
    (base) => ({
      ...base,
      vars: { ...base.vars, TTR_TRUSTED_TYPES_DRIVE: 'off' },
    }),
    /Source vars require explicit profile review/,
  ],
  [
    'a missing Trusted Types var',
    (base) => ({
      ...base,
      vars: Object.fromEntries(
        Object.entries(base.vars).filter(
          ([key]) => key !== 'TTR_TRUSTED_TYPES_DRIVE'
        )
      ),
    }),
    /Source vars require explicit profile review/,
  ],
  [
    'enforced Trusted Types',
    (base) => ({
      ...base,
      vars: { ...base.vars, TTR_TRUSTED_TYPES_DRIVE: 'enforce' },
    }),
    /Source vars require explicit profile review/,
  ],
  [
    'a one-origin flag',
    (base) => ({
      ...base,
      vars: { ...base.vars, TTR_ONE_ORIGIN_DRIVE: 'shadow' },
    }),
    /Source vars require explicit profile review/,
  ],
  [
    'a staging central API origin',
    (base) => ({
      ...base,
      vars: {
        ...base.vars,
        INTERNAL_WEB_API_ORIGIN: 'https://web.tutur3u.com',
      },
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
    'a service binding',
    (base) => ({
      ...base,
      services: [
        {
          binding: 'ABUSE_GUARD',
          service: 'tuturuuu-abuse-guard',
          entrypoint: 'AbuseGuardEntrypoint',
        },
      ],
    }),
    /Unadmitted source resource: services/,
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
  test(`Drive production seal refuses ${name}`, (t) => {
    const dir = fixture(t, 'drive');
    mutateBase(dir, change);
    assert.throws(
      () => prepare(dir, 'drive', 'production', undefined, sha),
      message
    );
  });
}

test('Drive secret names never duplicate a bound var and the source must be exact', () => {
  const profile = profileFor('drive', 'production');
  const base = {
    name: 'tuturuuu-drive',
    no_bundle: true,
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    vars: driveVars,
    assets: {
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  const options = { main: 'index.js', assets: 'client', sourceSha: sha };
  assert.equal(
    publicationConfig(base, profile, options).vars.TTR_TRUSTED_TYPES_DRIVE,
    'report'
  );
  assert.throws(
    () =>
      publicationConfig(
        { ...base, vars: { ...driveVars, NEXT_PUBLIC_SUPABASE_URL: 'x' } },
        {
          ...profile,
          secrets: [...profile.secrets, 'NEXT_PUBLIC_SUPABASE_URL'],
        },
        options
      ),
    /Source vars require explicit profile review/
  );
  assert.throws(
    () => publicationConfig(base, profile, { ...options, sourceSha: '' }),
    /Exact Drive production source required/
  );
});

test('Drive release inputs admit only the production Supabase host', () => {
  const env = {
    APP: 'drive',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DRIVE_PRODUCTION_HOST}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_drive_production',
  };
  assert.match(assertReleaseInputs(env), /^[a-f0-9]{64}$/);
  assert.throws(
    () =>
      assertReleaseInputs({
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: 'https://fxefojytwimjiqxseqag.supabase.co',
      }),
    /Drive production URL host is not the admitted host/
  );
});

test('the producer builds Drive with its Void production profile and qualifies it before sealing', () => {
  const workflow = readWorkflow('wave1-native-production.yaml');
  assert.ok(workflow.on.workflow_dispatch.inputs.app.options.includes('drive'));
  const steps = workflow.jobs.qualify.steps;
  const index = (name) => steps.findIndex((step) => step.name === name);
  const generic =
    steps[index('Build admitted production frontend and transitive suppliers')];
  assert.match(generic.if, /inputs\.app != 'drive'/);
  const suppliers = steps[index('Build Drive workspace suppliers')];
  const worker = steps[index('Build the Drive production native Worker')];
  const config = steps[index('Qualify the emitted Drive production profile')];
  const workerd =
    steps[
      index(
        'Workerd acceptance of the emitted Drive Worker on both production hosts'
      )
    ];
  for (const step of [suppliers, worker, config, workerd])
    assert.equal(step.if, "${{ inputs.app == 'drive' }}");
  assert.equal(
    suppliers.with.command,
    'bun turbo:local run build --filter="@tuturuuu/drive^..." --concurrency=2'
  );
  assert.equal(
    worker.with.command,
    'cd apps/drive && bun run build:cloudflare'
  );
  for (const step of [suppliers, worker]) assert.equal(step.with.token, '');
  assert.equal(worker.env.VITE_DRIVE_NATIVE_PROFILE, 'production');
  assert.equal(worker.env.NODE_ENV, 'production');
  assert.equal(config.env.VITE_DRIVE_NATIVE_PROFILE, 'production');
  assert.equal(
    config.run,
    'python3 scripts/ci/drive-native-artifact.py config apps/drive'
  );
  assert.equal(workerd.env.DRIVE_SOURCE_SHA, '${{ env.SOURCE_SHA }}');
  assert.equal(
    workerd.run,
    'node --test apps/drive/cloudflare/cutover.runtime.mjs'
  );
  const order = [
    'Generate exact source metadata',
    'Build Drive workspace suppliers',
    'Build the Drive production native Worker',
    'Qualify the emitted Drive production profile',
    'Workerd acceptance of the emitted Drive Worker on both production hosts',
    'Prepare the production profile and receipt',
  ].map(index);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b)
  );
  assert.ok(order.every((position) => position >= 0));
  for (const step of [suppliers, worker, config, workerd])
    assert.doesNotMatch(JSON.stringify(step), /secrets\./);
  const doctor = steps[index('Pre-seal doctor on the production Host header')];
  assert.match(
    doctor.run,
    /\[ "\$APP" = drive \]; then FLAGS\+=\(--expect-redirect\)/
  );
});

test('the Drive qualification workflow uses the same production build identity', () => {
  const qualification = readWorkflow('drive-cloudflare-artifact.yaml');
  const env = qualification.jobs.build.env;
  assert.equal(env.VITE_DRIVE_NATIVE_PROFILE, 'production');
  assert.equal(env.NEXT_PUBLIC_APP_URL, 'https://drive.tuturuuu.com');
  assert.equal(env.NEXT_PUBLIC_WEB_APP_URL, 'https://tuturuuu.com');
  assert.equal(env.NODE_ENV, 'production');
  const command = qualification.jobs.build.steps.find(
    (step) =>
      step.name === 'Workerd acceptance on the canonical and mounted hosts'
  ).run;
  assert.equal(
    command,
    'node --test apps/drive/cloudflare/cutover.runtime.mjs'
  );
});

test('the configure step writes only the profile public URLs for Drive', () => {
  const step = readWorkflow(
    'wave1-native-production.yaml'
  ).jobs.qualify.steps.find(
    (item) =>
      item.name === 'Configure exact production public inputs and identity'
  );
  const scratch = mkdtempSync(join(tmpdir(), 'wave1-drive-configure-'));
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
    const githubEnv = join(scratch, 'drive.env');
    writeFileSync(githubEnv, '');
    const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', script], {
      cwd: resolve(root),
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        APP: 'drive',
        SOURCE_SHA: sha,
        RELEASE_ARTIFACT: 'false',
        GITHUB_ENV: githubEnv,
        NEXT_PUBLIC_SUPABASE_URL: `https://${DRIVE_PRODUCTION_HOST}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(githubEnv, 'utf8'),
      'NEXT_PUBLIC_APP_URL=https://drive.tuturuuu.com\nNEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com\n'
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('the runtime gate exercises the Drive apex mount and refuses the staging host', () => {
  const runtime = read('scripts/ci/wave1-native-runtime.mjs');
  assert.match(
    runtime,
    /app === 'finance' \|\| app === 'drive'\n\s+\? `\$\{app\}\.tutur3u\.com`/
  );
  assert.match(runtime, /basePath: `\/\$\{app\}`/);
  assert.match(runtime, /app === 'drive'\n\s+\) \{/);
});
