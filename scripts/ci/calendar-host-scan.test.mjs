import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  scanCalendarArtifact,
  scanCalendarForwardingSources,
} from './calendar-host-scan.mjs';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper');

function artifact(files) {
  const root = mkdtempSync(join(tmpdir(), 'calendar-host-scan-'));
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
      ['calendar.tuturuuu.com'],
      'const web = "https://tuturuuu.com";',
    ],
    // Shared URL constants may still name production hosts in staging bytes.
    [
      'staging',
      ['calendar.tutur3u.com'],
      'const og = "https://calendar.tuturuuu.com/og.png";',
    ],
  ]) {
    const root = artifact({
      'server/index.js': `${mounts(hosts)}\nconst empty = { rootHosts: [] };\n${extra}`,
      'client/assets/app.js': mounts(hosts),
      // Source maps embed both branches of source; they are never scanned.
      'server/index.js.map': mounts([
        'calendar.tutur3u.com',
        'calendar.tuturuuu.com',
      ]),
    });
    try {
      assert.deepEqual(scanCalendarArtifact(root, profile), { lists: 2 });
    } finally {
      rmSync(root, { recursive: true });
    }
  }
});

test('rejects cross-environment hosts, the production Supabase ref and unfolded lists', () => {
  const cases = [
    // N8 bytes: the production artifact names the staging host anywhere.
    [
      'production',
      {
        'server/index.js': `${mounts(['calendar.tuturuuu.com'])} "calendar.tutur3u.com"`,
      },
      /contains calendar\.tutur3u/,
    ],
    // N9 bytes: the staging artifact keeps the production root host.
    [
      'staging',
      {
        'server/index.js': mounts([
          'calendar.tutur3u.com',
          'calendar.tuturuuu.com',
        ]),
      },
      /has rootHosts/,
    ],
    [
      'staging',
      { 'server/index.js': mounts(['calendar.tuturuuu.com']) },
      /has rootHosts/,
    ],
    [
      'staging',
      {
        'server/index.js': `${mounts(['calendar.tutur3u.com'])} "https://nzamlzqfdwaaxdefwraj.supabase.co"`,
      },
      /nzamlzqfdwaaxdefwraj/,
    ],
    [
      'production',
      {
        'server/index.js': `${mounts(['calendar.tuturuuu.com'])} "calendar-cutover.tutur3u.com"`,
      },
      /calendar-cutover/,
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
      assert.throws(() => scanCalendarArtifact(root, profile), message);
    } finally {
      rmSync(root, { recursive: true });
    }
  }
  assert.throws(
    () => scanCalendarArtifact(tmpdir(), 'development'),
    /Unknown Calendar profile/
  );
});

const buildPaths = [
  ['wave1-native-production.yaml', 'qualify', null, 'production'],
  ['mail-calendar-tasks-builds.yaml', 'calendar-native', null, 'production'],
  [
    'vercel-production-calendar.yaml',
    null,
    'Build Project Artifacts',
    'production',
  ],
  [
    'vercel-preview-calendar.yaml',
    null,
    'Build Project Artifacts',
    'production',
  ],
];

test('every Calendar build path sets an explicit deployment profile', () => {
  for (const [file, jobName, stepName, expected] of buildPaths) {
    const workflow = readWorkflow(file);
    if (jobName) {
      assert.equal(
        workflow.jobs[jobName].env.CALENDAR_DEPLOYMENT_PROFILE,
        expected,
        file
      );
      continue;
    }
    const steps = Object.values(workflow.jobs).flatMap(
      (job) => job.steps ?? []
    );
    const step = steps.find((candidate) => candidate.name === stepName);
    assert.equal(step?.env?.CALENDAR_DEPLOYMENT_PROFILE, expected, file);
  }
  const wave1 = readWorkflow('wave1-native-app.yaml');
  assert.deepEqual(wave1.jobs.build.strategy.matrix.profile, [
    'staging',
    'production',
  ]);
  assert.equal(
    wave1.jobs.build.env.CALENDAR_DEPLOYMENT_PROFILE,
    `\${{ matrix.profile }}`
  );
  const turbo = JSON.parse(
    readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8')
  );
  assert.ok(
    turbo.globalEnv.includes('CALENDAR_DEPLOYMENT_PROFILE'),
    'Turbo must hash the profile'
  );
});

test('CI scans original and restored Calendar artifacts in both directions', () => {
  const wave1 = readWorkflow('wave1-native-app.yaml');
  for (const job of ['build', 'restored']) {
    const scan = wave1.jobs[job].steps.find((step) =>
      step.run?.includes('calendar-host-scan.mjs')
    );
    assert.ok(scan, `${job} must scan`);
    assert.equal(scan.if, "inputs.app == 'calendar'");
    assert.match(scan.run, /"\$PROFILE"/);
  }
  const production = readWorkflow('wave1-native-production.yaml');
  assert.ok(
    production.jobs.qualify.steps.some((step) =>
      step.run?.includes('calendar-host-scan.mjs "apps/$APP/dist" production')
    ),
    'Production qualification must scan'
  );
  const builds = readWorkflow('mail-calendar-tasks-builds.yaml');
  assert.ok(
    builds.jobs['calendar-native'].steps.some(
      (step) =>
        step.run ===
        'node scripts/ci/calendar-host-scan.mjs apps/calendar/dist production'
    ),
    'Calendar CI build must scan'
  );
});

test('the dev server is the only explicit development caller', () => {
  const pkg = JSON.parse(
    readFileSync(
      new URL('../../apps/calendar/package.json', import.meta.url),
      'utf8'
    )
  );
  assert.match(
    pkg.scripts['dev:app'],
    /^CALENDAR_DEPLOYMENT_PROFILE=development /
  );
  assert.equal(pkg.scripts.build, 'vp build');
  for (const name of ['build', 'start', 'preview'])
    assert.doesNotMatch(pkg.scripts[name], /CALENDAR_DEPLOYMENT_PROFILE/, name);
});

test('staging forwarding sources name no production host', () => {
  const appDir = join(import.meta.dirname, '../../apps/calendar');
  assert.deepEqual(scanCalendarForwardingSources(appDir), { sources: 5 });
});

test('flags a production host fallback in staging forwarding sources', () => {
  const root = artifact({
    'src/runtime/handler.ts':
      "const fallback = isStaging ? undefined : 'https://tasks.tuturuuu.com';",
    'src/runtime/other.ts': "const web = 'https://tuturuuu.com';",
    'src/runtime/allowed.ts': "const root = 'tuturuuu.com'; // host-scan-allow",
    'src/runtime/clean.ts': 'const tasks = process.env.TASKS_APP_URL;',
  });
  try {
    assert.throws(
      () => scanCalendarForwardingSources(root, ['src/runtime/handler.ts']),
      /handler\.ts:1 names a production host/
    );
    assert.throws(
      () => scanCalendarForwardingSources(root, ['src/runtime/other.ts']),
      /other\.ts:1 names a production host/
    );
    assert.deepEqual(
      scanCalendarForwardingSources(root, [
        'src/runtime/allowed.ts',
        'src/runtime/clean.ts',
      ]),
      { sources: 2 }
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
