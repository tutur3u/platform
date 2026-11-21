import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  scanMailArtifact,
  scanMailForwardingSources,
} from './mail-host-scan.mjs';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper');
const workflowsDir = new URL('../../.github/workflows/', import.meta.url);

function artifact(files) {
  const root = mkdtempSync(join(tmpdir(), 'mail-host-scan-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}
const mounts = (hosts) =>
  `const config = { mounts: { rootHosts: ${JSON.stringify(hosts)}, mountHosts: [], unknownHost: "reject" } };`;

test('accepts each artifact carrying only its own folded host list', () => {
  for (const [profile, hosts, extra] of [
    [
      'production',
      ['mail.tuturuuu.com'],
      'const web = "https://tuturuuu.com";',
    ],
    // Shared URL constants may still name production hosts in staging bytes.
    [
      'staging',
      ['mail.tutur3u.com'],
      'const og = "https://mail.tuturuuu.com/og.png";',
    ],
  ]) {
    const root = artifact({
      'server/index.js': `${mounts(hosts)}\nconst empty = { rootHosts: [] };\n${extra}`,
      'client/assets/app.js': mounts(hosts),
      // Source maps embed both branches of source; they are never scanned.
      'server/index.js.map': mounts(['mail.tutur3u.com', 'mail.tuturuuu.com']),
    });
    try {
      assert.deepEqual(scanMailArtifact(root, profile), { lists: 2 });
    } finally {
      rmSync(root, { recursive: true });
    }
  }
});

test('rejects cross-environment hosts, the production Supabase ref and unfolded lists', () => {
  const cases = [
    // The production artifact names the staging host anywhere.
    [
      'production',
      {
        'server/index.js': `${mounts(['mail.tuturuuu.com'])} "mail.tutur3u.com"`,
      },
      /contains mail\.tutur3u/,
    ],
    // The staging artifact keeps the production root host.
    [
      'staging',
      { 'server/index.js': mounts(['mail.tutur3u.com', 'mail.tuturuuu.com']) },
      /has rootHosts/,
    ],
    [
      'staging',
      { 'server/index.js': mounts(['mail.tuturuuu.com']) },
      /has rootHosts/,
    ],
    [
      'production',
      { 'server/index.js': mounts(['mail.tutur3u.com']) },
      /contains mail\.tutur3u/,
    ],
    [
      'staging',
      {
        'server/index.js': `${mounts(['mail.tutur3u.com'])} "https://nzamlzqfdwaaxdefwraj.supabase.co"`,
      },
      /nzamlzqfdwaaxdefwraj/,
    ],
    // An unfolded ternary leaves no literal list: fail closed.
    [
      'production',
      { 'server/index.js': 'rootHosts: "production" === "production" ? a : b' },
      /no folded rootHosts/,
    ],
    ['staging', { 'server/deploy.json': '{}' }, /no folded rootHosts/],
  ];
  for (const [profile, files, message] of cases) {
    const root = artifact(files);
    try {
      assert.throws(() => scanMailArtifact(root, profile), message);
    } finally {
      rmSync(root, { recursive: true });
    }
  }
  assert.throws(
    () => scanMailArtifact(tmpdir(), 'development'),
    /Unknown Mail profile/
  );
});

const stepEnv = (workflow, stepName) =>
  Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === stepName)?.env;

const buildPaths = [
  ['wave1-native-production.yaml', { job: 'qualify' }],
  ['mail-calendar-tasks-builds.yaml', { job: 'build-mail' }],
  ['programming-app-builds.yaml', { job: 'build' }],
  ['app-builds-affected.yaml', { job: 'build' }],
  ['vercel-preview-mail.yaml', { step: 'Build Project Artifacts' }],
  ['mail-vercel-exact-sha.yaml', { step: 'Publish the exact SHA once' }],
];

test('every Mail build path sets an explicit deployment profile', () => {
  for (const [file, where] of buildPaths) {
    const workflow = readWorkflow(file);
    const env = where.job
      ? workflow.jobs[where.job].env
      : stepEnv(workflow, where.step);
    assert.equal(env?.MAIL_DEPLOYMENT_PROFILE, 'production', file);
  }
  const wave1 = readWorkflow('wave1-native-app.yaml');
  assert.deepEqual(wave1.jobs.build.strategy.matrix.profile, [
    'staging',
    'production',
  ]);
  assert.equal(
    wave1.jobs.build.env.MAIL_DEPLOYMENT_PROFILE,
    `\${{ matrix.profile }}`
  );
  const turbo = JSON.parse(
    readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8')
  );
  assert.ok(
    turbo.globalEnv.includes('MAIL_DEPLOYMENT_PROFILE'),
    'Turbo must hash the profile'
  );
});

test('no workflow builds Mail without naming the deployment profile', () => {
  const buildsMail = [
    /--filter=@tuturuuu\/mail\b/u,
    /mail-exact-sha-publisher/u,
    /VERCEL_MAIL_PROJECT_ID[\s\S]*vercel build/u,
    /app:\s*\[[^\]]*\bmail\b[^\]]*\]/u,
    /\bmail\|/u,
  ];
  const unprotected = readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .filter((name) => {
      const text = readFileSync(new URL(name, workflowsDir), 'utf8');
      return (
        buildsMail.some((pattern) => pattern.test(text)) &&
        !text.includes('MAIL_DEPLOYMENT_PROFILE')
      );
    });
  assert.deepEqual(unprotected, []);
});

test('CI scans original and restored Mail artifacts in both directions', () => {
  const wave1 = readWorkflow('wave1-native-app.yaml');
  for (const job of ['build', 'restored']) {
    const scan = wave1.jobs[job].steps.find((step) =>
      step.run?.includes('mail-host-scan.mjs')
    );
    assert.ok(scan, `${job} must scan`);
    assert.equal(scan.if, "inputs.app == 'mail'");
    assert.match(scan.run, /"\$PROFILE"/);
  }
  const production = readWorkflow('wave1-native-production.yaml');
  assert.ok(
    production.jobs.qualify.steps.some((step) =>
      step.run?.includes('mail-host-scan.mjs "apps/$APP/dist" production')
    ),
    'Production qualification must scan'
  );
  const builds = readWorkflow('mail-calendar-tasks-builds.yaml');
  assert.ok(
    builds.jobs['build-mail'].steps.some(
      (step) =>
        step.run ===
        'node scripts/ci/mail-host-scan.mjs apps/mail/dist production'
    ),
    'Mail CI build must scan'
  );
});

test('the dev server is the only explicit development caller of the build', () => {
  const pkg = JSON.parse(
    readFileSync(
      new URL('../../apps/mail/package.json', import.meta.url),
      'utf8'
    )
  );
  assert.match(pkg.scripts['dev:app'], /^MAIL_DEPLOYMENT_PROFILE=development /);
  assert.doesNotMatch(pkg.scripts.build, /MAIL_DEPLOYMENT_PROFILE/);
});

test('staging forwarding sources name no production host', () => {
  const appDir = join(import.meta.dirname, '../../apps/mail');
  assert.deepEqual(scanMailForwardingSources(appDir), { sources: 2 });
});

test('flags a production host fallback in staging forwarding sources', () => {
  const root = artifact({
    'src/runtime/handler.ts':
      "const fallback = isStaging ? undefined : 'https://mail.tuturuuu.com';",
    'src/runtime/other.ts': "const web = 'https://tuturuuu.com';",
    'src/runtime/allowed.ts': "const root = 'tuturuuu.com'; // host-scan-allow",
    'src/runtime/clean.ts': 'const web = process.env.WEB_APP_URL;',
  });
  try {
    assert.throws(
      () => scanMailForwardingSources(root, ['src/runtime/handler.ts']),
      /handler\.ts:1 names a production host/
    );
    assert.throws(
      () => scanMailForwardingSources(root, ['src/runtime/other.ts']),
      /other\.ts:1 names a production host/
    );
    assert.deepEqual(
      scanMailForwardingSources(root, [
        'src/runtime/allowed.ts',
        'src/runtime/clean.ts',
      ]),
      { sources: 2 }
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
