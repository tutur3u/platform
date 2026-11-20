import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readAllWorkflows } from './workflow-yaml-test-helper.js';
import { failSafePath } from './affected-apps.mjs';
import {
  MOBILE_DIRS,
  SHARED_PATH_FILTERS,
  affectedResult,
  buildPlan,
  cloudflareOwnership,
  loadOwnership,
  resolveBase,
} from './ci-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function graph(dependents, names = {}) {
  const dirs = [...dependents.keys()];
  return { dirs, dependents, names };
}

const dependents = new Map([
  ['packages/ui', new Set(['apps/calendar', 'apps/web'])],
  ['apps/calendar', new Set()],
  ['apps/web', new Set()],
  ['apps/meet', new Set()],
  ['apps/docs', new Set()],
  ['apps/mobile', new Set()],
  ['apps/meet-realtime', new Set()],
  ['packages/realtime', new Set(['apps/meet-realtime'])],
]);

const names = {
  'packages/ui': '@tuturuuu/ui',
  'apps/calendar': '@tuturuuu/calendar',
  'apps/web': '@tuturuuu/web',
  'apps/meet': '@tuturuuu/meet',
};

const ownership = {
  calendar: ['apps/calendar/', '.github/workflows/calendar-cloudflare.yaml'],
  meet: [
    'apps/meet/',
    'apps/meet-realtime/',
    'apps/web/src/lib/meet/**',
    '.github/workflows/meet-cloudflare.yaml',
  ],
};

const plan = (files, extraEdges = {}) =>
  buildPlan({ files, graph: graph(dependents, names), extraEdges, ownership });

test('a calendar source change deploys calendar and skips meet', () => {
  const result = plan(['apps/calendar/src/store.ts']);
  assert.equal(result.uncertain, false);
  assert.deepEqual(result.cloudflare.run, ['calendar']);
  assert.deepEqual(
    result.cloudflare.skip.map((item) => item.id),
    ['meet']
  );
  assert.equal(result.test.run, true);
  assert.equal(result.typecheck.run, true);
  assert.equal(result.typecheck.narrow, true);
  assert.match(result.typecheck.filters, /--filter=\.\.\.@tuturuuu\/calendar/);
  assert.match(result.typecheck.filters, /--filter='!@tuturuuu\/tanstack-web'/);
  assert.equal(result.mobile.run, false);
  assert.equal(result.docs.run, false);
  assert.equal(result.vercel.owner, 'vercel-production.yaml');
});

test('a shared package change selects dependents and not unrelated apps', () => {
  const result = plan(['packages/ui/src/button.tsx']);
  assert.equal(result.uncertain, false);
  assert.deepEqual(result.cloudflare.run, ['calendar']);
  assert.ok(result.affected.includes('apps/web'));
  assert.equal(result.affected.includes('apps/meet'), false);
  assert.deepEqual(result.build.apps, ['web']);
});

test('lockfile and turbo config stay uncertain and run every selector', () => {
  for (const file of ['bun.lock', 'turbo.json']) {
    const result = plan([file]);
    assert.equal(result.uncertain, true, file);
    assert.deepEqual(result.cloudflare.skip, []);
    assert.deepEqual(result.cloudflare.run, ['calendar', 'meet']);
    assert.equal(result.test.run, true);
    assert.equal(result.typecheck.run, true);
    assert.equal(result.typecheck.narrow, false);
    assert.equal(affectedResult(result).mode, 'all');
  }
});

test('repository prose skips deploys and unit tests and keeps docs', () => {
  const result = plan(['README.md']);
  assert.equal(result.uncertain, false);
  assert.equal(result.test.run, false);
  assert.equal(result.docs.run, true);
  assert.equal(result.lint.run, false);
  assert.equal(result.typecheck.run, false);
  assert.deepEqual(result.cloudflare.run, []);
  assert.deepEqual(
    result.cloudflare.skip.map((item) => item.id),
    ['calendar', 'meet']
  );
});

test('markdown and config inside a workspace still run tests', () => {
  assert.equal(plan(['apps/web/src/help.md']).test.run, true);
  assert.equal(plan(['packages/ui/README.md']).test.run, true);
  const docsJson = plan(['apps/docs/docs.json']);
  assert.equal(docsJson.test.run, true);
  assert.equal(docsJson.docs.run, true);
  assert.equal(docsJson.typecheck.run, false);
  assert.equal(plan(['unknown']).uncertain, true);
  assert.equal(plan([]).test.run, true);
});

test('meet ownership adds meet without removing the web workspace', () => {
  const file = 'apps/web/src/lib/meet/room.ts';
  const without = buildPlan({
    files: [file],
    graph: graph(dependents, names),
    ownership: {
      calendar: ownership.calendar,
      meet: ['apps/meet/'],
    },
  });
  assert.equal(without.cloudflare.run.includes('meet'), false);
  assert.ok(without.affected.includes('apps/web'));
  const withMeet = plan([file]);
  assert.ok(withMeet.cloudflare.run.includes('meet'));
  assert.ok(withMeet.affected.includes('apps/web'));
  assert.equal(withMeet.mobile.run, false);
});

test('an extra edge adds dependents and does not invent the meet mapping', () => {
  const result = plan(['apps/calendar/src/a.ts'], {
    'apps/calendar/': ['apps/web'],
  });
  assert.ok(result.affected.includes('apps/web'));
  assert.equal(result.affected.includes('apps/meet'), false);
});

test('mobile seeds follow the mobile workflow path list', () => {
  assert.equal(plan(['apps/mobile/lib/main.dart']).mobile.run, true);
  assert.equal(plan(['packages/realtime/src/index.ts']).mobile.run, true);
  assert.equal(plan(['apps/meet-realtime/src/worker.ts']).mobile.run, true);
  const workflows = readAllWorkflows(undefined, { raw: true });
  const mobile = workflows['mobile.yaml'];
  const paths = [
    ...(mobile.on.push.paths ?? []),
    ...(mobile.on.pull_request.paths ?? []),
  ];
  const owned = new Set(MOBILE_DIRS.map((dir) => `${dir}/**`));
  const shared = new Set([
    'bun.lock',
    '.github/workflows/mobile.yaml',
    'scripts/mobile-lucide/**',
    'scripts/check-mobile-lucide-sync.js',
    'scripts/check-mobile-shadcn-imports.js',
    'scripts/dart-directive-uris.js',
    '.github/actions/setup-flutter-with-cache/**',
    '.github/actions/cache-litertlm-native/**',
  ]);
  for (const pattern of paths) {
    assert.ok(
      owned.has(pattern) || shared.has(pattern),
      `mobile path ${pattern} is not a planner seed or a known shared filter`
    );
  }
});

test('the catalog matches every affected-gate workflow and keeps specific paths', () => {
  const workflows = readAllWorkflows(undefined, { raw: true });
  const gated = Object.fromEntries(
    Object.entries(workflows).filter(
      ([, workflow]) => workflow.jobs?.['affected-gate']
    )
  );
  const expected = cloudflareOwnership(gated);
  assert.deepEqual(loadOwnership(repoRoot), expected);
  assert.ok(expected.meet.includes('apps/web/src/lib/meet/**'));
  for (const [file, workflow] of Object.entries(gated)) {
    const app = workflow.jobs['affected-gate'].steps.find(
      (step) => step.uses === './.github/actions/affected-gate'
    ).with.app;
    const bodies = [workflow.on?.pull_request, workflow.on?.push].filter(
      Boolean
    );
    for (const body of bodies) {
      for (const pattern of body.paths ?? []) {
        if (pattern.startsWith('!') || SHARED_PATH_FILTERS.has(pattern))
          continue;
        if (
          pattern.startsWith('scripts/') ||
          pattern.startsWith('.github/') ||
          failSafePath(pattern)
        )
          continue;
        assert.ok(
          expected[app]?.includes(pattern) ||
            expected[app]?.includes(`apps/${app}/`),
          `${file} path ${pattern} is missing from the plan catalog`
        );
      }
    }
  }
});

test('manual runs and a missing push base stay uncertain', () => {
  assert.equal(
    resolveBase({ EVENT_NAME: 'workflow_dispatch' }).uncertain,
    true
  );
  assert.equal(
    resolveBase({ EVENT_NAME: 'push', BEFORE_SHA: '' }).uncertain,
    true
  );
  assert.equal(
    resolveBase({ EVENT_NAME: 'push', BEFORE_SHA: '0'.repeat(40) }).uncertain,
    true
  );
  assert.deepEqual(
    resolveBase({ EVENT_NAME: 'push', BEFORE_SHA: 'a'.repeat(40) }),
    { base: 'a'.repeat(40) }
  );
  assert.equal(
    resolveBase({ EVENT_NAME: 'merge_group', QUEUE_BASE_SHA: 'nope' })
      .uncertain,
    true
  );
});
